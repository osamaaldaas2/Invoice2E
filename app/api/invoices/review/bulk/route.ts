import { NextRequest, NextResponse } from 'next/server';
import { invoiceDbService } from '@/services/invoice.db.service';
import { reviewService, type ReviewedInvoiceData } from '@/services/review.service';
import { logger } from '@/lib/logger';
import { getAuthenticatedUser } from '@/lib/auth';
import { handleApiError } from '@/lib/api-helpers';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';
import { createUserScopedClient } from '@/lib/supabase.server';
import { toLegacyFormat } from '@/lib/format-utils';
import type { OutputFormat } from '@/types/canonical-invoice';
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
    const parsed = BulkReviewSchema.parse(body);
    const results: BulkReviewResult[] = [];

    // P0-2: Create user-scoped client for RLS-based data isolation
    const userClient = await createUserScopedClient(user.id);

    for (const item of parsed.items) {
      try {
        const extraction = await invoiceDbService.getExtractionById(item.extractionId, userClient);
        if (extraction.userId !== user.id) {
          results.push({
            extractionId: item.extractionId,
            success: false,
            error: 'Unauthorized',
          });
          continue;
        }

        const reviewedData = item.reviewedData;
        reviewService.validateReviewedData(reviewedData as ReviewedInvoiceData);

        const extractionData = extraction.extractionData as Record<string, unknown>;
        const accuracy = reviewService.calculateAccuracy(
          extractionData,
          reviewedData as ReviewedInvoiceData
        );

        // T6: Preserve original AI extraction as snapshot (parity with single-file review)
        const persistData: Record<string, unknown> = {
          ...(reviewedData as Record<string, unknown>),
          _originalExtraction: extractionData,
        };

        await invoiceDbService.updateExtraction(
          item.extractionId,
          {
            extractionData: persistData,
          },
          userClient
        );

        const invoiceNumber = String(reviewedData.invoiceNumber || '');
        const buyerName = String(reviewedData.buyerName || '');

        // Resolve output format from reviewed data, fallback to xrechnung-cii
        const itemOutputFormat = (reviewedData.outputFormat as OutputFormat) || 'xrechnung-cii';
        const existingConversion = await invoiceDbService.getConversionByExtractionId(
          item.extractionId,
          userClient
        );
        const conversion = existingConversion
          ? await invoiceDbService.updateConversion(
              existingConversion.id,
              {
                invoiceNumber,
                buyerName,
                conversionFormat: toLegacyFormat(itemOutputFormat),
                conversionStatus: 'draft',
              },
              userClient
            )
          : await invoiceDbService.createConversion(
              {
                userId: user.id,
                extractionId: item.extractionId,
                invoiceNumber,
                buyerName,
                conversionFormat: toLegacyFormat(itemOutputFormat),
                conversionStatus: 'draft',
              },
              userClient
            );

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
        const supabase = userClient;
        const { data: batchJob } = await supabase
          .from('batch_jobs')
          .select('results, updated_at')
          .eq('id', parsed.batchId)
          .eq('user_id', user.id)
          .maybeSingle();

        type BatchResultEntry = Record<string, unknown>;

        if (batchJob && Array.isArray(batchJob.results)) {
          const updatedResults = (batchJob.results as BatchResultEntry[]).map((entry) => {
            if (entry.extractionId && reviewedExtractionIds.has(entry.extractionId as string)) {
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
          const successCount = updatedResults.filter((r) => r.status === 'success').length;
          const failCount = updatedResults.filter((r) => r.status === 'failed').length;
          let batchStatus: string;
          if (failCount === 0) {
            batchStatus = 'completed';
          } else if (successCount === 0) {
            batchStatus = 'failed';
          } else {
            batchStatus = 'partial_success';
          }

          const { data: updateResult } = await supabase
            .from('batch_jobs')
            .update({
              results: updatedResults,
              completed_files: successCount,
              failed_files: failCount,
              status: batchStatus,
            })
            .eq('id', parsed.batchId)
            .eq('user_id', user.id)
            .eq('updated_at', batchJob.updated_at) // optimistic lock
            .select('id');

          if (!updateResult || updateResult.length === 0) {
            logger.warn('Batch review optimistic lock conflict — concurrent update detected', {
              batchId: parsed.batchId,
            });
          }
        }
      } catch (batchUpdateError) {
        logger.warn('Failed to update batch review statuses', {
          batchId: parsed.batchId,
          error:
            batchUpdateError instanceof Error ? batchUpdateError.message : String(batchUpdateError),
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
