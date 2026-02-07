import { NextRequest, NextResponse } from 'next/server';
import { invoiceDbService } from '@/services/invoice.db.service';
import { reviewService } from '@/services/review.service';
import { logger } from '@/lib/logger';
import { getAuthenticatedUser } from '@/lib/auth';
import { handleApiError } from '@/lib/api-helpers';

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

        const userId = user.id; // SECURE: From authenticated session only

        const body = await request.json();
        const { extractionId, reviewedData } = body;
        // REMOVED: userId from body destructuring - Security vulnerability

        if (!extractionId || !reviewedData) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Get original extraction
        const extraction = await invoiceDbService.getExtractionById(extractionId);

        // SECURITY FIX: Verify ownership using authenticated session user ID
        if (extraction.userId !== userId) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 403 }
            );
        }

        // Validate reviewed data
        reviewService.validateReviewedData(reviewedData);

        // Track changes and calculate accuracy
        const extractionData = extraction.extractionData as Record<string, unknown>;
        const changes = reviewService.trackChanges(extractionData, reviewedData);
        const accuracy = reviewService.calculateAccuracy(extractionData, reviewedData);

        // Persist reviewed data back to extraction for resume/download flow
        await invoiceDbService.updateExtraction(extractionId, {
            extractionData: reviewedData,
            status: 'draft',
        });

        // Create or update conversion record
        const existingConversion = await invoiceDbService.getConversionByExtractionId(extractionId);
        const conversion = existingConversion
            ? await invoiceDbService.updateConversion(existingConversion.id, {
                invoiceNumber: reviewedData.invoiceNumber,
                buyerName: reviewedData.buyerName,
                conversionFormat: 'xrechnung',
                conversionStatus: 'draft',
            })
            : await invoiceDbService.createConversion({
                userId,
                extractionId,
                invoiceNumber: reviewedData.invoiceNumber,
                buyerName: reviewedData.buyerName,
                conversionFormat: 'xrechnung',
                conversionStatus: 'draft',
            });

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
            message: 'Internal server error'
        });
    }
}

export async function OPTIONS(): Promise<NextResponse> {
    return NextResponse.json({}, { status: 200 });
}
