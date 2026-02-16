import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invoiceDbService } from '@/services/invoice.db.service';
import { reviewService } from '@/services/review.service';
import { logger } from '@/lib/logger';
import { getAuthenticatedUser } from '@/lib/auth';
import { handleApiError } from '@/lib/api-helpers';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';
import { createUserScopedClient } from '@/lib/supabase.server';

const ReviewLineItemSchema = z.object({
    description: z.string().max(500).default(''),
    quantity: z.union([z.number(), z.string()]).transform(Number).pipe(z.number().finite()),
    unitPrice: z.union([z.number(), z.string()]).transform(Number).pipe(z.number().finite()),
    totalPrice: z.union([z.number(), z.string()]).transform(Number).pipe(z.number().finite()),
    taxRate: z.union([z.number(), z.string()]).transform(Number).pipe(z.number().min(0).max(100)).optional(),
    unitCode: z.string().max(10).optional(),
    taxCategoryCode: z.string().max(10).optional(),
});

const ReviewedDataSchema = z.object({
    invoiceNumber: z.string().min(1, 'Invoice number is required').max(200),
    invoiceDate: z.string().max(50).optional(),
    sellerName: z.string().min(1, 'Seller name is required').max(500),
    sellerEmail: z.string().max(320).optional(),
    sellerPhone: z.string().max(50).optional(),
    sellerAddress: z.string().max(500).optional(),
    sellerStreet: z.string().max(500).optional(),
    sellerCity: z.string().max(200).optional(),
    sellerPostalCode: z.string().max(20).optional(),
    sellerCountryCode: z.string().max(5).optional(),
    sellerTaxId: z.string().max(100).optional(),
    sellerTaxNumber: z.string().max(100).optional(),
    sellerVatId: z.string().max(100).optional(),
    sellerIban: z.string().max(50).optional(),
    sellerBic: z.string().max(20).optional(),
    sellerContactName: z.string().max(200).optional(),
    sellerElectronicAddress: z.string().max(200).optional(),
    sellerElectronicAddressScheme: z.string().max(10).optional(),
    buyerName: z.string().min(1, 'Buyer name is required').max(500),
    buyerEmail: z.string().max(320).optional(),
    buyerAddress: z.string().max(500).optional(),
    buyerStreet: z.string().max(500).optional(),
    buyerCity: z.string().max(200).optional(),
    buyerPostalCode: z.string().max(20).optional(),
    buyerCountryCode: z.string().max(5).optional(),
    buyerTaxId: z.string().max(100).optional(),
    buyerVatId: z.string().max(100).optional(),
    buyerReference: z.string().max(200).optional(),
    buyerElectronicAddress: z.string().max(200).optional(),
    buyerElectronicAddressScheme: z.string().max(10).optional(),
    lineItems: z.array(ReviewLineItemSchema).min(1, 'At least one line item is required'),
    subtotal: z.union([z.number(), z.string()]).transform(Number).pipe(z.number().finite()).optional(),
    taxAmount: z.union([z.number(), z.string()]).transform(Number).pipe(z.number().finite()).optional(),
    totalAmount: z.union([z.number(), z.string()]).transform(Number).pipe(z.number().finite()).optional(),
    currency: z.string().max(10).optional(),
    paymentTerms: z.string().max(500).optional(),
    dueDate: z.string().max(50).optional(),
    documentTypeCode: z.string().max(10).optional(),
    precedingInvoiceReference: z.string().max(200).optional(),
}).passthrough();

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // SECURITY FIX (BUG-002): Authenticate user from session, not request body
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const rateLimitId = `${getRequestIdentifier(request)}:invoices-review:${user.id}`;
    const rateLimit = await checkRateLimitAsync(rateLimitId, 'api');
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

    const userId = user.id; // SECURE: From authenticated session only

    // F3: Create user-scoped client for RLS-based data isolation
    const userClient = await createUserScopedClient(userId);

    const body = await request.json();
    const { extractionId, reviewedData: rawReviewedData } = body;
    // REMOVED: userId from body destructuring - Security vulnerability

    if (!extractionId || !rawReviewedData) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const parsedReview = ReviewedDataSchema.safeParse(rawReviewedData);
    if (!parsedReview.success) {
      const firstError = parsedReview.error.errors[0]?.message || 'Invalid review data';
      logger.warn('Review validation failed', { errors: parsedReview.error.errors });
      return NextResponse.json({ success: false, error: firstError }, { status: 400 });
    }
    // Safe cast: Zod validated core fields, .passthrough() preserves all extra fields
    // needed by ReviewedInvoiceData (notes, sellerContact, etc.)
    const reviewedData = parsedReview.data as unknown as import('@/services/review.service').ReviewedInvoiceData;

    // Get original extraction with user-scoped client (RLS enforced)
    const extraction = await invoiceDbService.getExtractionById(extractionId, userClient);

    // SECURITY FIX: Verify ownership using authenticated session user ID
    if (extraction.userId !== userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    // Validate reviewed data
    reviewService.validateReviewedData(reviewedData);

    // Track changes and calculate accuracy
    const extractionData = extraction.extractionData as Record<string, unknown>;
    const changes = reviewService.trackChanges(extractionData, reviewedData);
    const accuracy = reviewService.calculateAccuracy(extractionData, reviewedData);

    // T4: Normalize empty strings to null before DB persist
    const cleanedData = reviewService.normalizeForPersistence(reviewedData);

    // T6: Preserve original AI extraction as snapshot before overwrite
    const persistData: Record<string, unknown> = {
      ...cleanedData,
      _originalExtraction: extractionData,
    };

    // Persist reviewed data back to extraction for resume/download flow (RLS enforced)
    await invoiceDbService.updateExtraction(extractionId, {
      extractionData: persistData,
    }, userClient);

    // Create or update conversion record (RLS enforced)
    const existingConversion = await invoiceDbService.getConversionByExtractionId(extractionId, userClient);
    const conversion = existingConversion
      ? await invoiceDbService.updateConversion(existingConversion.id, {
          invoiceNumber: reviewedData.invoiceNumber,
          buyerName: reviewedData.buyerName,
          conversionFormat: 'XRechnung',
          conversionStatus: 'draft',
        }, userClient)
      : await invoiceDbService.createConversion({
          userId,
          extractionId,
          invoiceNumber: reviewedData.invoiceNumber,
          buyerName: reviewedData.buyerName,
          conversionFormat: 'XRechnung',
          conversionStatus: 'draft',
        }, userClient);

    logger.info('Invoice review completed', {
      extractionId,
      conversionId: conversion.id,
      changesCount: changes.length,
      accuracy,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          conversionId: conversion.id,
          changes,
          accuracy,
          message: 'Invoice review saved successfully',
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error, 'Review error', {
      includeSuccess: true,
      message: 'Internal server error',
    });
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return NextResponse.json({}, { status: 200 });
}
