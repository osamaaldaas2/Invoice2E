import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invoiceDbService } from '@/services/invoice.db.service';
import { logger } from '@/lib/logger';
import { AppError, ValidationError } from '@/lib/errors';
import { getAuthenticatedUser } from '@/lib/auth';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';
import { handleApiError } from '@/lib/api-helpers';
import { createUserScopedClient } from '@/lib/supabase.server';
import { validateForProfile } from '@/validation/validation-pipeline';
import { getFormatMetadata } from '@/lib/format-registry';
import type { ProfileId } from '@/validation/profiles/IProfileValidator';
import { toCanonicalInvoice } from '@/services/format/canonical-mapper';
import { GeneratorFactory } from '@/services/format/GeneratorFactory';
import type { OutputFormat } from '@/types/canonical-invoice';
export type ConversionFormat = 'CII' | 'UBL' | OutputFormat;

/** Explicit mapping from OutputFormat to ProfileId for validation. */
function formatToProfileId(format: OutputFormat): ProfileId {
  switch (format) {
    case 'xrechnung-cii': return 'xrechnung-cii';
    case 'xrechnung-ubl': return 'xrechnung-ubl';
    case 'peppol-bis':    return 'peppol-bis';
    case 'facturx-en16931':
    case 'facturx-basic': return 'en16931-base';
    case 'fatturapa':     return 'fatturapa';
    case 'ksef':          return 'ksef';
    case 'nlcius':        return 'nlcius';
    case 'cius-ro':       return 'cius-ro';
    default:
      return format satisfies never;
  }
}

/** Map legacy format strings to OutputFormat */
function resolveOutputFormat(format: string): OutputFormat {
  switch (format) {
    case 'CII': return 'xrechnung-cii';
    case 'UBL': return 'xrechnung-ubl';
    default: return format as OutputFormat;
  }
}

/** Map OutputFormat back to legacy DB format string */
function toLegacyFormat(format: OutputFormat): string {
  switch (format) {
    case 'xrechnung-cii': return 'XRechnung';
    case 'xrechnung-ubl': return 'UBL';
    case 'peppol-bis':    return 'PEPPOL BIS';
    case 'facturx-en16931': return 'Factur-X EN16931';
    case 'facturx-basic': return 'Factur-X Basic';
    case 'fatturapa':     return 'FatturaPA';
    case 'ksef':          return 'KSeF';
    case 'nlcius':        return 'NLCIUS';
    case 'cius-ro':       return 'CIUS-RO';
    default: return format;
  }
}

const ConvertRequestSchema = z.object({
  conversionId: z.string().min(1, 'Extraction ID is required'),
  invoiceData: z
    .record(z.string(), z.unknown())
    .refine(
      (data) => typeof data.invoiceNumber === 'string' && data.invoiceNumber.trim().length > 0,
      { message: 'Invoice number is required' }
    )
    .refine((data) => typeof data.buyerName === 'string' && data.buyerName.trim().length > 0, {
      message: 'Buyer name is required',
    })
    .refine((data) => typeof data.sellerName === 'string' && data.sellerName.trim().length > 0, {
      message: 'Seller name is required',
    })
    .refine((data) => Array.isArray(data.lineItems) && data.lineItems.length > 0, {
      message: 'At least one line item is required',
    }),
  format: z.enum(['CII', 'UBL', 'xrechnung-cii', 'xrechnung-ubl', 'peppol-bis', 'facturx-en16931', 'facturx-basic', 'fatturapa', 'ksef', 'nlcius', 'cius-ro']).default('CII'),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    logger.info('Convert request received');

    // SECURITY FIX (BUG-003): Authenticate user from session, not request body
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const userId = user.id; // SECURE: From authenticated session only

    // F3: Create user-scoped client for RLS-based data isolation
    const userClient = await createUserScopedClient(userId);

    // SECURITY: Rate limit convert requests
    const rateLimitId = getRequestIdentifier(request) + ':convert:' + userId;
    const rateLimit = await checkRateLimitAsync(rateLimitId, 'convert');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many requests. Try again in ${rateLimit.resetInSeconds} seconds.`,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimit.resetInSeconds) },
        }
      );
    }

    const body = await request.json();
    const parsed = ConvertRequestSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message || 'Invalid request body';
      logger.warn('Convert validation failed', { errors: parsed.error.errors });
      return NextResponse.json({ success: false, error: firstError }, { status: 400 });
    }

    const extractionId = parsed.data.conversionId;
    const invoiceData = parsed.data.invoiceData;
    const outputFormat = parsed.data.format;

    logger.info('Starting XRechnung conversion', {
      extractionId,
      invoiceNumber: invoiceData.invoiceNumber,
      userId,
    });

    // Map input data to canonical invoice model (handles sellerTaxId splitting,
    // country code defaults, electronic address fallback, etc.)
    const resolvedFormat = resolveOutputFormat(outputFormat);
    const canonical = toCanonicalInvoice(invoiceData, resolvedFormat);

    logger.info('Canonical invoice mapped', {
      invoiceNumber: canonical.invoiceNumber,
      format: resolvedFormat,
    });

    let result: {
      xmlContent: string;
      fileName: string;
      fileSize: number;
      validationStatus: string;
      validationErrors: string[];
      validationWarnings?: string[];
    };

    try {
      // Pre-generation validation: pass canonical directly to the validation pipeline
      const preValidation = validateForProfile(canonical, formatToProfileId(resolvedFormat));
      if (!preValidation.valid) {
        const errorMessages = preValidation.errors.map((e: { ruleId: string; message: string }) => `[${e.ruleId}] ${e.message}`);
        throw new ValidationError(
          `${resolvedFormat === 'xrechnung-ubl' ? 'UBL' : 'XRechnung'} validation failed:\n` + errorMessages.join('\n'),
          { structuredErrors: preValidation.errors as unknown as Record<string, unknown> }
        );
      }

      // Generate XML via the format generator factory
      const generator = GeneratorFactory.create(resolvedFormat);
      const genResult = await generator.generate(canonical);

      // If the generator produced PDF content (e.g. Factur-X), return it as PDF
      if (genResult.pdfContent) {
        logger.info('Returning PDF output', {
          format: resolvedFormat,
          fileName: genResult.fileName,
          fileSize: genResult.pdfContent.length,
        });

        // Still update DB before returning
        try {
          let conversion = await invoiceDbService.getConversionByExtractionId(extractionId, userClient);
          if (!conversion) {
            conversion = await invoiceDbService.createConversion({
              userId,
              extractionId,
              invoiceNumber: String(invoiceData.invoiceNumber || ''),
              buyerName: String(invoiceData.buyerName || ''),
              conversionFormat: toLegacyFormat(resolvedFormat),
              outputFormat: resolvedFormat,
              conversionStatus: 'completed',
            }, userClient);
          }
          if (conversion.userId !== userId) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
          }
          await invoiceDbService.updateConversion(conversion.id, {
            validationStatus: genResult.validationStatus === 'warnings' ? 'valid' : genResult.validationStatus,
            validationErrors: genResult.validationErrors.length > 0
              ? ({ errors: genResult.validationErrors } as Record<string, unknown>)
              : undefined,
            conversionStatus: 'completed',
            xmlContent: genResult.xmlContent,
            xmlFileName: genResult.fileName,
          }, userClient);
          await invoiceDbService.updateExtraction(extractionId, { status: 'completed' }, userClient);
        } catch (dbErr) {
          logger.error('Failed to update DB for PDF conversion', { error: dbErr instanceof Error ? dbErr.message : String(dbErr) });
        }

        return new NextResponse(new Uint8Array(genResult.pdfContent), {
          status: 200,
          headers: {
            'Content-Type': genResult.mimeType || 'application/pdf',
            'Content-Disposition': `attachment; filename="${genResult.fileName}"`,
            'Content-Length': String(genResult.pdfContent.length),
          },
        });
      }

      result = {
        xmlContent: genResult.xmlContent,
        fileName: genResult.fileName,
        fileSize: genResult.fileSize,
        validationStatus: genResult.validationStatus === 'warnings' ? 'valid' : genResult.validationStatus,
        validationErrors: genResult.validationErrors,
        validationWarnings: genResult.validationWarnings,
      };

      logger.info('Invoice generated successfully', {
        format: resolvedFormat,
        xmlSize: result.xmlContent.length,
        fileName: result.fileName,
      });
    } catch (generationError) {
      logger.error('XML generation failed', {
        format: resolvedFormat,
        errorType:
          generationError instanceof Error
            ? generationError.constructor.name
            : typeof generationError,
        errorMessage:
          generationError instanceof Error ? generationError.message : String(generationError),
        errorStack: generationError instanceof Error ? generationError.stack : undefined,
        invoiceNumber: canonical.invoiceNumber,
      });

      if (generationError instanceof ValidationError) {
        // Return structured validation errors with actionable suggestions
        const structuredErrors = (generationError as ValidationError & { structuredErrors?: Record<string, unknown> }).structuredErrors;
        return NextResponse.json(
          {
            success: false,
            error: `Validation failed: ${generationError.message}`,
            validationErrors: structuredErrors || [],
          },
          { status: 400 }
        );
      }

      if (generationError instanceof AppError) {
        return NextResponse.json(
          { success: false, error: generationError.message },
          { status: generationError.statusCode }
        );
      }

      throw generationError;
    }

    if (!result || !result.xmlContent) {
      logger.error('XRechnung result is invalid', { result });
      return NextResponse.json(
        { success: false, error: 'Failed to generate XRechnung XML' },
        { status: 500 }
      );
    }

    // Update conversion status after successful generation
    try {
      // conversionId from frontend is actually extractionId, resolve to actual conversion ID (RLS enforced)
      let conversion = await invoiceDbService.getConversionByExtractionId(extractionId, userClient);

      // If no conversion record exists (e.g. batch-created extraction never individually reviewed),
      // create one on-the-fly so the download can proceed
      if (!conversion) {
        logger.info('No conversion record found, creating one on-the-fly', { extractionId, userId });
        conversion = await invoiceDbService.createConversion({
          userId,
          extractionId,
          invoiceNumber: String(invoiceData.invoiceNumber || ''),
          buyerName: String(invoiceData.buyerName || ''),
          conversionFormat: toLegacyFormat(resolvedFormat),
          outputFormat: resolvedFormat,
          conversionStatus: 'completed',
        }, userClient);
      }

      // Ownership check: verify the conversion belongs to this user
      if (conversion.userId !== userId) {
        logger.warn('Convert ownership mismatch', {
          extractionId,
          userId,
          conversionUserId: conversion.userId,
        });
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
      }

      const actualConversionId = conversion.id;
      logger.info('Updating conversion record', {
        extractionId,
        conversionId: actualConversionId,
        userId,
      });

      // Update validation status, cache XML, and mark conversion as completed (PERF-2, RLS enforced)
      await invoiceDbService.updateConversion(actualConversionId, {
        validationStatus: result.validationStatus,
        validationErrors:
          result.validationErrors.length > 0
            ? ({ errors: result.validationErrors } as Record<string, unknown>)
            : undefined,
        conversionStatus: 'completed',
        xmlContent: result.xmlContent,
        xmlFileName: result.fileName,
      }, userClient);

      // Mark extraction as completed (RLS enforced)
      await invoiceDbService.updateExtraction(extractionId, { status: 'completed' }, userClient);
    } catch (txError) {
      logger.error('Failed to update conversion status', {
        userId,
        extractionId,
        errorMessage: txError instanceof Error ? txError.message : String(txError),
        errorStack: txError instanceof Error ? txError.stack : undefined,
        errorType: txError instanceof Error ? txError.constructor.name : typeof txError,
      });
      return NextResponse.json(
        { success: false, error: 'Failed to update conversion status. Please try again.' },
        { status: 500 }
      );
    }

    logger.info('XRechnung conversion completed successfully', {
      extractionId,
      fileName: result.fileName,
      validationStatus: result.validationStatus,
    });

    const formatMeta = getFormatMetadata(resolvedFormat);

    return NextResponse.json(
      {
        success: true,
        data: {
          xmlContent: result.xmlContent,
          fileName: result.fileName,
          fileSize: result.fileSize,
          validationStatus: result.validationStatus,
          validationErrors: result.validationErrors,
          validationWarnings: result.validationWarnings,
          formatId: formatMeta.id,
          displayName: formatMeta.displayName,
          mimeType: formatMeta.mimeType,
          fileExtension: formatMeta.fileExtension,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error, 'Convert route error', {
      includeSuccess: true,
      message: 'Internal server error during conversion. Please try again or contact support.',
    });
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return NextResponse.json({}, { status: 200 });
}
