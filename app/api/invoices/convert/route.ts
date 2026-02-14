import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { xrechnungService } from '@/services/xrechnung.service';
import { ublService } from '@/services/ubl.service';
import { invoiceDbService } from '@/services/invoice.db.service';
import { logger } from '@/lib/logger';
import { AppError, ValidationError } from '@/lib/errors';
import { isEuVatId } from '@/lib/extraction-normalizer';
import { getAuthenticatedUser } from '@/lib/auth';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';
import { handleApiError } from '@/lib/api-helpers';
import { requireCsrfToken } from '@/lib/csrf';
import { createUserScopedClient } from '@/lib/supabase.server';
import { validateForXRechnung } from '@/validation/validation-pipeline';
import type { XRechnungInvoiceData } from '@/services/xrechnung/types';

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

    // CSRF protection
    const csrfError = await requireCsrfToken(request);
    if (csrfError) return csrfError as NextResponse;

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
    //
    // FIX: Normalize seller tax identifiers (BT-31 / BT-32) from the legacy sellerTaxId field.
    // The review form only has a single "sellerTaxId" field, but EN 16931 requires separate
    // VAT ID (BT-31, schemeID=VA) and tax number (BT-32, schemeID=FC). Split them here.
    const rawSellerTaxId = invoiceData.sellerTaxId || '';
    let sellerVatId = invoiceData.sellerVatId || null;
    let sellerTaxNumber = invoiceData.sellerTaxNumber || null;
    if (!sellerVatId && !sellerTaxNumber && rawSellerTaxId) {
      if (isEuVatId(rawSellerTaxId)) {
        sellerVatId = rawSellerTaxId;
      } else {
        sellerTaxNumber = rawSellerTaxId;
      }
    }

    const serviceData = {
      ...invoiceData,
      sellerVatId,
      sellerTaxNumber,
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

        // Run the same BR-DE validation pipeline as CII path
        // Map UBL-shaped data to XRechnungInvoiceData for validation
        const validationData: XRechnungInvoiceData = {
          invoiceNumber: serviceData.invoiceNumber || '',
          invoiceDate: serviceData.invoiceDate || new Date().toISOString().split('T')[0],
          sellerName: serviceData.sellerName || '',
          sellerEmail: serviceData.sellerEmail,
          sellerAddress: serviceData.sellerAddress,
          sellerCity: serviceData.sellerCity,
          sellerPostalCode: serviceData.sellerPostalCode,
          sellerCountryCode: serviceData.sellerCountryCode || 'DE',
          sellerTaxId: serviceData.sellerTaxId,
          sellerVatId: sellerVatId,
          sellerTaxNumber: sellerTaxNumber,
          sellerElectronicAddress: serviceData.sellerElectronicAddress,
          sellerElectronicAddressScheme: serviceData.sellerElectronicAddressScheme,
          sellerIban: serviceData.sellerIban,
          sellerBic: serviceData.sellerBic,
          sellerContactName: serviceData.sellerContactName || serviceData.sellerContact,
          sellerPhoneNumber: serviceData.sellerPhoneNumber || serviceData.sellerPhone,
          buyerName: serviceData.buyerName,
          buyerEmail: serviceData.buyerEmail,
          buyerAddress: serviceData.buyerAddress,
          buyerCity: serviceData.buyerCity,
          buyerPostalCode: serviceData.buyerPostalCode,
          buyerCountryCode: serviceData.buyerCountryCode || 'DE',
          buyerReference: serviceData.buyerReference,
          buyerVatId: serviceData.buyerVatId,
          buyerElectronicAddress: serviceData.buyerElectronicAddress,
          buyerElectronicAddressScheme: serviceData.buyerElectronicAddressScheme,
          lineItems: (serviceData.lineItems || []).map((item: Record<string, unknown>) => ({
            description: (item.description as string) || '',
            quantity: Number(item.quantity) || 1,
            unitPrice: Number(item.unitPrice) || 0,
            totalPrice: Number(item.totalPrice) || Number(item.lineTotal) || 0,
            unitCode: item.unitCode as string | undefined,
            taxRate: item.taxRate as number | undefined,
            taxCategoryCode: item.taxCategoryCode as string | undefined,
          })),
          subtotal: Number(serviceData.subtotal) || 0,
          taxAmount: Number(serviceData.taxAmount) || 0,
          totalAmount: Number(serviceData.totalAmount) || 0,
          currency: serviceData.currency || 'EUR',
          paymentTerms: serviceData.paymentTerms,
          dueDate: serviceData.dueDate,
          documentTypeCode: serviceData.documentTypeCode,
          precedingInvoiceReference: serviceData.precedingInvoiceReference,
          prepaidAmount: serviceData.prepaidAmount != null ? Number(serviceData.prepaidAmount) : undefined,
          allowanceCharges: serviceData.allowanceCharges,
        };

        const ublValidation = validateForXRechnung(validationData);
        if (!ublValidation.valid) {
          const errorMessages = ublValidation.errors.map((e: { ruleId: string; message: string }) => `[${e.ruleId}] ${e.message}`);
          throw new ValidationError('UBL validation failed:\n' + errorMessages.join('\n'), {
            structuredErrors: ublValidation.errors as unknown as Record<string, unknown>,
          });
        }

        const xml = await ublService.generate({
          invoiceNumber: serviceData.invoiceNumber || '',
          invoiceDate: serviceData.invoiceDate || new Date().toISOString().split('T')[0],
          dueDate: serviceData.dueDate,
          currency: serviceData.currency || 'EUR',
          sellerName: serviceData.sellerName || '',
          sellerEmail: serviceData.sellerEmail || '',
          sellerPhone: serviceData.sellerPhoneNumber || serviceData.sellerPhone,
          sellerContactName: serviceData.sellerContactName || serviceData.sellerContact,
          sellerTaxId: serviceData.sellerTaxId || '',
          sellerVatId: serviceData.sellerVatId,
          sellerTaxNumber: serviceData.sellerTaxNumber,
          sellerAddress: serviceData.sellerAddress,
          sellerCity: serviceData.sellerCity,
          sellerPostalCode: serviceData.sellerPostalCode,
          sellerCountryCode: serviceData.sellerCountryCode || 'DE',
          sellerElectronicAddress: serviceData.sellerElectronicAddress,
          sellerElectronicAddressScheme: serviceData.sellerElectronicAddressScheme,
          sellerIban: serviceData.sellerIban,
          sellerBic: serviceData.sellerBic,
          buyerName: serviceData.buyerName || '',
          buyerEmail: serviceData.buyerEmail,
          buyerAddress: serviceData.buyerAddress,
          buyerCity: serviceData.buyerCity,
          buyerPostalCode: serviceData.buyerPostalCode,
          buyerCountryCode: serviceData.buyerCountryCode || 'DE',
          buyerReference: serviceData.buyerReference,
          buyerVatId: serviceData.buyerVatId,
          buyerElectronicAddress: serviceData.buyerElectronicAddress,
          buyerElectronicAddressScheme: serviceData.buyerElectronicAddressScheme,
          lineItems: (serviceData.lineItems || []).map((item: Record<string, unknown>) => ({
            description: (item.description as string) || '',
            quantity: Number(item.quantity) || 1,
            unitPrice: Number(item.unitPrice) || 0,
            totalPrice: Number(item.totalPrice) || Number(item.lineTotal) || 0,
            unitCode: item.unitCode as string | undefined,
            taxPercent: item.taxRate as number | undefined,
            taxCategoryCode: item.taxCategoryCode as string | undefined,
          })),
          subtotal: Number(serviceData.subtotal) || 0,
          taxAmount: Number(serviceData.taxAmount) || 0,
          totalAmount: Number(serviceData.totalAmount) || 0,
          notes: serviceData.notes,
          paymentTerms: serviceData.paymentTerms,
          documentTypeCode: serviceData.documentTypeCode,
          precedingInvoiceReference: serviceData.precedingInvoiceReference,
          prepaidAmount: serviceData.prepaidAmount != null ? Number(serviceData.prepaidAmount) : undefined,
          billingPeriodStart: serviceData.billingPeriodStart,
          billingPeriodEnd: serviceData.billingPeriodEnd,
          allowanceCharges: serviceData.allowanceCharges,
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
          conversionFormat: outputFormat === 'UBL' ? 'UBL' : 'XRechnung',
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
