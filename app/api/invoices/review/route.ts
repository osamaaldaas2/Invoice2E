import { NextRequest, NextResponse } from 'next/server';
import { invoiceDbService } from '@/services/invoice.db.service';
import { reviewService } from '@/services/review.service';
import { logger } from '@/lib/logger';
import { getAuthenticatedUser } from '@/lib/auth';
import { handleApiError } from '@/lib/api-helpers';
import { requireCsrfToken } from '@/lib/csrf';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';
import { createUserScopedClient } from '@/lib/supabase.server';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // CSRF protection
    const csrfError = await requireCsrfToken(request);
    if (csrfError) return csrfError as NextResponse;

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
    const { extractionId, reviewedData } = body;
    // REMOVED: userId from body destructuring - Security vulnerability

    if (!extractionId || !reviewedData) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

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
