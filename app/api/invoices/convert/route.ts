import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { xrechnungService } from '@/services/xrechnung.service';
import { ublService } from '@/services/ubl.service';
import { invoiceDbService } from '@/services/invoice.db.service';
import { logger } from '@/lib/logger';
import { AppError, ValidationError } from '@/lib/errors';
import { getAuthenticatedUser } from '@/lib/auth';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';
import { handleApiError } from '@/lib/api-helpers';

export type ConversionFormat = 'CII' | 'UBL';

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
  format: z.enum(['CII', 'UBL']).default('CII'),
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

    // Zod validated required fields. Use raw body for downstream access
    // since invoiceData has 20+ optional fields used by UBL/CII generators.
    const extractionId = parsed.data.conversionId;
    const invoiceData = body.invoiceData;
    const outputFormat = parsed.data.format;

    logger.info('Starting XRechnung conversion', {
      extractionId,
      invoiceNumber: invoiceData.invoiceNumber,
      userId,
    });

    // Generate XML based on format
    // Need to map ReviewedInvoiceData (from review form) to ExtractedInvoiceData (for service)
    const serviceData = {
      ...invoiceData,
      sellerCountryCode: invoiceData.sellerCountryCode || 'DE',
      buyerCountryCode: invoiceData.buyerCountryCode || 'DE',
      // Backward compat: derive electronic addresses from email for pre-migration DB records
      buyerElectronicAddress: invoiceData.buyerElectronicAddress || invoiceData.buyerEmail || null,
      buyerElectronicAddressScheme:
        invoiceData.buyerElectronicAddressScheme || (invoiceData.buyerEmail ? 'EM' : null),
      sellerElectronicAddress:
        invoiceData.sellerElectronicAddress || invoiceData.sellerEmail || null,
      sellerElectronicAddressScheme:
        invoiceData.sellerElectronicAddressScheme || (invoiceData.sellerEmail ? 'EM' : null),
    };

    let result: {
      xmlContent: string;
      fileName: string;
      fileSize: number;
      validationStatus: string;
      validationErrors: string[];
      validationWarnings?: string[];
    };

    try {
      if (outputFormat === 'UBL') {
        logger.info('Generating UBL 2.1 invoice', {
          invoiceNumber: serviceData.invoiceNumber,
        });

        const xml = await ublService.generate({
          invoiceNumber: serviceData.invoiceNumber || '',
          invoiceDate: serviceData.invoiceDate || new Date().toISOString().split('T')[0],
          dueDate: serviceData.dueDate,
          currency: serviceData.currency || 'EUR',
          sellerName: serviceData.sellerName || '',
          sellerEmail: serviceData.sellerEmail || '',
          sellerPhone: serviceData.sellerPhone,
          sellerTaxId: serviceData.sellerTaxId || '',
          sellerAddress: serviceData.sellerAddress,
          sellerCity: serviceData.sellerCity,
          sellerPostalCode: serviceData.sellerPostalCode,
          sellerCountryCode: serviceData.sellerCountryCode || 'DE',
          buyerName: serviceData.buyerName || '',
          buyerEmail: serviceData.buyerEmail,
          buyerAddress: serviceData.buyerAddress,
          buyerCity: serviceData.buyerCity,
          buyerPostalCode: serviceData.buyerPostalCode,
          buyerCountryCode: serviceData.buyerCountryCode || 'DE',
          buyerReference: serviceData.buyerReference,
          lineItems: (serviceData.lineItems || []).map((item: Record<string, unknown>) => ({
            description: (item.description as string) || '',
            quantity: Number(item.quantity) || 1,
            unitPrice: Number(item.unitPrice) || 0,
            totalPrice: Number(item.totalPrice) || Number(item.lineTotal) || 0,
            unitCode: item.unitCode as string | undefined,
            taxPercent: item.taxRate as number | undefined,
          })),
          subtotal: Number(serviceData.subtotal) || 0,
          taxAmount: Number(serviceData.taxAmount) || 0,
          totalAmount: Number(serviceData.totalAmount) || 0,
          notes: serviceData.notes,
          paymentTerms: serviceData.paymentTerms,
        });

        const validation = await ublService.validate(xml);

        result = {
          xmlContent: xml,
          fileName: `${serviceData.invoiceNumber || 'invoice'}_ubl.xml`,
          fileSize: new TextEncoder().encode(xml).length,
          validationStatus: validation.valid ? 'valid' : 'invalid',
          validationErrors: validation.errors,
          validationWarnings: [],
        };

        logger.info('UBL invoice generated successfully', {
          xmlSize: result.xmlContent.length,
          fileName: result.fileName,
        });
      } else {
        // Default: CII/XRechnung format
        logger.info('Generating XRechnung (CII) invoice', {
          invoiceNumber: serviceData.invoiceNumber,
        });

        result = await xrechnungService.generateXRechnung(serviceData);

        logger.info('XRechnung generated successfully', {
          xmlSize: result.xmlContent?.length,
          fileName: result.fileName,
        });
      }
    } catch (generationError) {
      logger.error('XML generation failed', {
        format: outputFormat,
        errorType:
          generationError instanceof Error
            ? generationError.constructor.name
            : typeof generationError,
        errorMessage:
          generationError instanceof Error ? generationError.message : String(generationError),
        errorStack: generationError instanceof Error ? generationError.stack : undefined,
        invoiceNumber: serviceData?.invoiceNumber,
      });

      if (generationError instanceof ValidationError) {
        return NextResponse.json(
          { success: false, error: `Validation failed: ${generationError.message}` },
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
      // conversionId from frontend is actually extractionId, resolve to actual conversion ID
      const conversion = await invoiceDbService.getConversionByExtractionId(extractionId);

      if (!conversion) {
        logger.error('Conversion not found for extraction', { extractionId, userId });
        return NextResponse.json(
          {
            success: false,
            error: 'Conversion record not found. Please review the invoice again.',
          },
          { status: 404 }
        );
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

      // Update validation status, cache XML, and mark conversion as completed (PERF-2)
      await invoiceDbService.updateConversion(actualConversionId, {
        validationStatus: result.validationStatus,
        validationErrors:
          result.validationErrors.length > 0
            ? ({ errors: result.validationErrors } as Record<string, unknown>)
            : undefined,
        conversionStatus: 'completed',
        xmlContent: result.xmlContent,
        xmlFileName: result.fileName,
      });

      // Mark extraction as completed
      await invoiceDbService.updateExtraction(extractionId, { status: 'completed' });
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
