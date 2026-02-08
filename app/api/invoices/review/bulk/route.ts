import { NextRequest, NextResponse } from 'next/server';
import { invoiceDbService } from '@/services/invoice.db.service';
import { reviewService } from '@/services/review.service';
import { logger } from '@/lib/logger';
import { getAuthenticatedUser } from '@/lib/auth';
import { handleApiError } from '@/lib/api-helpers';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';
import { createServerClient } from '@/lib/supabase.server';
import { z } from 'zod';

const BulkReviewItemSchema = z.object({
    extractionId: z.string().uuid(),
    reviewedData: z.record(z.string(), z.unknown()),
});

const BulkReviewSchema = z.object({
    batchId: z.string().uuid().optional(),
    items: z.array(BulkReviewItemSchema).min(1).max(100),
});

type BulkReviewResult = {
    extractionId: string;
    success: boolean;
    conversionId?: string;
    accuracy?: number;
    error?: string;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json(
                { success: false, error: 'Authentication required' },
                { status: 401 }
            );
        }

        const rateLimitId = `${getRequestIdentifier(request)}:invoices-review-bulk:${user.id}`;
        const rateLimit = await checkRateLimitAsync(rateLimitId, 'api');
        if (!rateLimit.allowed) {
            return NextResponse.json(
                { success: false, error: `Too many requests. Try again in ${rateLimit.resetInSeconds} seconds.` },
                {
                    status: 429,
                    headers: { 'Retry-After': String(rateLimit.resetInSeconds) },
                }
            );
        }

        const body = await request.json();
        const parsed = BulkReviewSchema.parse(body);
        const results: BulkReviewResult[] = [];

        for (const item of parsed.items) {
            try {
                const extraction = await invoiceDbService.getExtractionById(item.extractionId);
                if (extraction.userId !== user.id) {
                    results.push({
                        extractionId: item.extractionId,
                        success: false,
                        error: 'Unauthorized',
                    });
                    continue;
                }

                const reviewedData = item.reviewedData;
                reviewService.validateReviewedData(reviewedData as any);

                const extractionData = extraction.extractionData as Record<string, unknown>;
                const accuracy = reviewService.calculateAccuracy(extractionData, reviewedData as any);

                await invoiceDbService.updateExtraction(item.extractionId, {
                    extractionData: reviewedData,
                    status: 'draft',
                });

                const existingConversion = await invoiceDbService.getConversionByExtractionId(item.extractionId);
                const conversion = existingConversion
                    ? await invoiceDbService.updateConversion(existingConversion.id, {
                        invoiceNumber: String((reviewedData as any).invoiceNumber || ''),
                        buyerName: String((reviewedData as any).buyerName || ''),
                        conversionFormat: 'xrechnung',
                        conversionStatus: 'draft',
                    })
                    : await invoiceDbService.createConversion({
                        userId: user.id,
                        extractionId: item.extractionId,
                        invoiceNumber: String((reviewedData as any).invoiceNumber || ''),
                        buyerName: String((reviewedData as any).buyerName || ''),
                        conversionFormat: 'xrechnung',
                        conversionStatus: 'draft',
                    });

                results.push({
                    extractionId: item.extractionId,
                    success: true,
                    conversionId: conversion.id,
                    accuracy,
                });
            } catch (error) {
                results.push({
                    extractionId: item.extractionId,
                    success: false,
                    error: error instanceof Error ? error.message : 'Review failed',
                });
            }
        }

        if (parsed.batchId) {
            try {
                const reviewedExtractionIds = new Set(
                    results.filter((r) => r.success).map((r) => r.extractionId)
                );
                const supabase = createServerClient();
                const { data: batchJob } = await supabase
                    .from('batch_jobs')
                    .select('results')
                    .eq('id', parsed.batchId)
                    .eq('user_id', user.id)
                    .maybeSingle();

                if (batchJob && Array.isArray(batchJob.results)) {
                    const updatedResults = batchJob.results.map((entry: any) => {
                        if (entry?.extractionId && reviewedExtractionIds.has(entry.extractionId)) {
                            return {
                                ...entry,
                                status: 'success',
                                reviewStatus: 'reviewed',
                                error: undefined,
                            };
                        }
                        return entry;
                    });

                    // Recompute batch-level counts and status
                    const successCount = updatedResults.filter((r: any) => r.status === 'success').length;
                    const failCount = updatedResults.filter((r: any) => r.status === 'failed').length;
                    let batchStatus: string;
                    if (failCount === 0) {
                        batchStatus = 'completed';
                    } else if (successCount === 0) {
                        batchStatus = 'failed';
                    } else {
                        batchStatus = 'partial_success';
                    }

                    await supabase
                        .from('batch_jobs')
                        .update({
                            results: updatedResults,
                            completed_files: successCount,
                            failed_files: failCount,
                            status: batchStatus,
                        })
                        .eq('id', parsed.batchId)
                        .eq('user_id', user.id);
                }
            } catch (batchUpdateError) {
                logger.warn('Failed to update batch review statuses', {
                    batchId: parsed.batchId,
                    error: batchUpdateError instanceof Error ? batchUpdateError.message : String(batchUpdateError),
                });
            }
        }

        const processed = results.filter((r) => r.success).length;
        const failed = results.length - processed;

        return NextResponse.json({
            success: true,
            data: {
                processed,
                failed,
                results,
            },
        });
    } catch (error) {
        return handleApiError(error, 'Bulk review error', {
            includeSuccess: true,
            message: 'Failed to save bulk review',
        });
    }
}

export async function OPTIONS(): Promise<NextResponse> {
    return NextResponse.json({}, { status: 200 });
}
