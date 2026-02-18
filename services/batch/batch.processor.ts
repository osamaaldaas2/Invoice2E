import { createAdminClient, createUserScopedClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import { ExtractorFactory } from '@/services/ai/extractor.factory';
import { creditsDbService } from '@/services/credits.db.service';
import { invoiceDbService } from '@/services/invoice.db.service';
import { resilientExtract } from '@/lib/ai-resilience';
import { isFeatureEnabled, FEATURE_FLAGS } from '@/lib/feature-flags';
import { boundaryDetectionService } from '@/services/boundary-detection.service';
import { pdfSplitterService } from '@/services/pdf-splitter.service';
import { BATCH_EXTRACTION, MULTI_INVOICE_CONCURRENCY } from '@/lib/constants';
import { NotFoundError } from '@/lib/errors';
import { BatchResult } from './types';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class BatchProcessor {
  /**
   * Retry extraction with exponential backoff on 429/transient errors.
   */
  private async extractWithRetry(
    extractor: ReturnType<typeof ExtractorFactory.create>,
    fileContent: Buffer,
    fileName: string,
    jobId: string
  ) {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= BATCH_EXTRACTION.MAX_RETRIES; attempt++) {
      try {
        // S3.3: Use circuit breaker when flag is enabled
        const adminClient = createAdminClient();
        const useCB = await isFeatureEnabled(adminClient, FEATURE_FLAGS.USE_CIRCUIT_BREAKER).catch(
          () => false
        );
        if (useCB) {
          return await resilientExtract(fileContent, fileName, 'application/pdf');
        }
        return await extractor.extractFromFile(fileContent, fileName, 'application/pdf');
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMessage = lastError.message;

        const isRetryable =
          errorMessage.includes('429') ||
          errorMessage.includes('rate limit') ||
          errorMessage.includes('quota') ||
          errorMessage.includes('RATE_LIMIT') ||
          errorMessage.includes('Too Many Requests') ||
          errorMessage.includes('503') ||
          errorMessage.includes('overloaded') ||
          errorMessage.includes('PARSE_ERROR') ||
          errorMessage.includes('Failed to parse');

        if (!isRetryable || attempt === BATCH_EXTRACTION.MAX_RETRIES) {
          throw lastError;
        }

        const backoffMs = Math.min(
          BATCH_EXTRACTION.INITIAL_BACKOFF_MS *
            Math.pow(BATCH_EXTRACTION.BACKOFF_MULTIPLIER, attempt),
          BATCH_EXTRACTION.MAX_BACKOFF_MS
        );

        logger.warn('AI extraction failed, retrying with backoff', {
          jobId,
          fileName,
          attempt: attempt + 1,
          maxRetries: BATCH_EXTRACTION.MAX_RETRIES,
          backoffMs,
          error: errorMessage,
        });

        await delay(backoffMs);
      }
    }

    throw lastError || new Error('Extraction failed after retries');
  }

  /**
   * Process a single file: extract data via AI and save as draft.
   * XML generation is deferred to user review (avoids validation failures
   * when AI-extracted data is missing required fields like country code).
   */
  private async processFile(
    file: { name: string; content: Buffer },
    index: number,
    extractor: ReturnType<typeof ExtractorFactory.create>,
    userId: string,
    jobId: string,
    results: BatchResult[],
    supabase: ReturnType<typeof createAdminClient>, // ADMIN: job management only
    userClient: Awaited<ReturnType<typeof createUserScopedClient>> // RLS-scoped: extraction data
  ): Promise<void> {
    const startedAt = new Date().toISOString();
    results[index] = {
      filename: file.name,
      status: 'pending',
      reviewStatus: 'not_available',
      startedAt,
    };

    logger.info('Processing file', { jobId, filename: file.name, index: index + 1 });

    try {
      // Detect invoice boundaries
      const boundaryResult = await boundaryDetectionService.detect(file.content, 'application/pdf');

      if (boundaryResult.totalInvoices > 1) {
        // Multi-invoice PDF: split and process each segment
        const pageGroups = boundaryResult.invoices.map((inv) => inv.pages);
        const splitBuffers = await pdfSplitterService.splitByPageGroups(file.content, pageGroups);

        logger.info('Multi-invoice PDF detected in batch', {
          jobId,
          filename: file.name,
          invoiceCount: boundaryResult.totalInvoices,
        });

        // Process all segments — extra credits settled in bulk at batch level
        // IMPORTANT: Keep results[index] as 'pending' until ALL segments are done.
        // Otherwise, replacing it with seg 0's success result makes completedFiles === totalFiles
        // prematurely when this is the last file, causing the frontend to stop polling early.
        const segments = splitBuffers.map((buf, s) => ({ buf, s }));
        let firstSegmentResult: BatchResult | null = null;
        const extraSegmentResults: BatchResult[] = [];

        for (let c = 0; c < segments.length; c += MULTI_INVOICE_CONCURRENCY) {
          const chunk = segments.slice(c, c + MULTI_INVOICE_CONCURRENCY);
          await Promise.all(
            chunk.map(async ({ buf, s }) => {
              const invoice = boundaryResult.invoices[s]!;
              const segmentName = `${file.name} [${invoice.label}]`;

              try {
                const extractedData = await this.extractWithRetry(
                  extractor,
                  buf,
                  segmentName,
                  jobId
                );
                // RLS: use user-scoped client so extraction is isolated to this tenant
                const extraction = await invoiceDbService.createExtraction(
                  {
                    userId,
                    extractionData: extractedData as unknown as Record<string, unknown>,
                    confidenceScore: extractedData.confidence,
                    status: 'completed',
                  },
                  userClient
                );
                const segmentResult: BatchResult = {
                  filename: segmentName,
                  status: 'success' as const,
                  invoiceNumber: extractedData.invoiceNumber || undefined,
                  extractionId: extraction.id,
                  confidenceScore:
                    typeof extractedData.confidence === 'number'
                      ? extractedData.confidence
                      : undefined,
                  reviewStatus: 'pending_review',
                  startedAt,
                  completedAt: new Date().toISOString(),
                };

                if (s === 0) {
                  firstSegmentResult = segmentResult;
                } else {
                  extraSegmentResults.push(segmentResult);
                }
              } catch (segError) {
                const errMsg = segError instanceof Error ? segError.message : 'Unknown error';
                const segmentResult: BatchResult = {
                  filename: segmentName,
                  status: 'failed' as const,
                  error: errMsg,
                  reviewStatus: 'not_available',
                  startedAt,
                  completedAt: new Date().toISOString(),
                };
                if (s === 0) {
                  firstSegmentResult = segmentResult;
                } else {
                  extraSegmentResults.push(segmentResult);
                }
              }
            })
          );

          // Live progress update after each segment chunk.
          // results[index] is still 'pending' — count completed segments separately.
          const segDoneCount = (firstSegmentResult ? 1 : 0) + extraSegmentResults.length;
          const segTotalCount = segments.length;
          const firstSeg = firstSegmentResult as BatchResult | null;
          const segSuccessCount =
            results.filter((r) => r.status === 'success').length +
            (firstSeg?.status === 'success' ? 1 : 0) +
            extraSegmentResults.filter((r) => r.status === 'success').length;
          const segFailCount =
            results.filter((r) => r.status === 'failed').length +
            (firstSeg?.status === 'failed' ? 1 : 0) +
            extraSegmentResults.filter((r) => r.status === 'failed').length;

          await supabase
            .from('batch_jobs')
            .update({
              // total_files accounts for the expansion (original slot + extra segments)
              total_files:
                results.length + extraSegmentResults.length + (segTotalCount - segDoneCount),
              completed_files: segSuccessCount,
              failed_files: segFailCount,
              // Don't write results to DB mid-processing — the pending slot would confuse the UI
            })
            .eq('id', jobId);
        }

        // All segments done — now commit to the results array
        if (firstSegmentResult) {
          results[index] = firstSegmentResult;
        }
        for (const extra of extraSegmentResults) {
          results.push(extra);
        }

        // Safety guard: if no segments were processed, mark as failed
        if (results[index]?.status === 'pending') {
          results[index] = {
            filename: file.name,
            status: 'failed' as const,
            error: `Multi-invoice split produced no processable segments (detected ${boundaryResult.totalInvoices} invoices)`,
            reviewStatus: 'not_available',
            startedAt,
            completedAt: new Date().toISOString(),
          };
        }
      } else {
        // Single invoice (existing flow)
        const extractedData = await this.extractWithRetry(
          extractor,
          file.content,
          file.name,
          jobId
        );

        // RLS: use user-scoped client so extraction is isolated to this tenant
        const extraction = await invoiceDbService.createExtraction(
          {
            userId,
            extractionData: extractedData as unknown as Record<string, unknown>,
            confidenceScore: extractedData.confidence,
            status: 'completed',
          },
          userClient
        );

        results[index] = {
          filename: file.name,
          status: 'success' as const,
          invoiceNumber: extractedData.invoiceNumber || undefined,
          extractionId: extraction.id,
          confidenceScore:
            typeof extractedData.confidence === 'number' ? extractedData.confidence : undefined,
          reviewStatus: 'pending_review',
          startedAt,
          completedAt: new Date().toISOString(),
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(
        'Failed to process file',
        error instanceof Error ? error : new Error(errorMessage)
      );
      logger.warn('File processing failure context', { jobId, filename: file.name });

      results[index] = {
        filename: file.name,
        status: 'failed' as const,
        error: errorMessage,
        reviewStatus: 'not_available',
        startedAt,
        completedAt: new Date().toISOString(),
      };
    }

    // Update progress after each file completes (total_files adjusts for multi-invoice expansion)
    const successCount = results.filter((r) => r.status === 'success').length;
    const failCount = results.filter((r) => r.status === 'failed').length;

    await supabase
      .from('batch_jobs')
      .update({
        total_files: results.length,
        completed_files: successCount,
        failed_files: failCount,
        results: results,
      })
      .eq('id', jobId);
  }

  /**
   * Process batch job with concurrent file extraction.
   */
  async processBatch(
    jobId: string,
    files: { name: string; content: Buffer }[]
  ): Promise<BatchResult[]> {
    const concurrency = BATCH_EXTRACTION.CONCURRENCY;
    logger.info('Processing batch', { jobId, fileCount: files.length, concurrency });

    const supabase = createAdminClient();
    const results: BatchResult[] = new Array(files.length);
    const extractor = ExtractorFactory.create();

    try {
      // Fetch batch job owner for credit deduction
      const { data: job, error: jobError } = await supabase
        .from('batch_jobs')
        .select('user_id')
        .eq('id', jobId)
        .single();

      if (jobError || !job?.user_id) {
        logger.error('Failed to resolve batch job owner', { jobId, error: jobError?.message });
        throw new NotFoundError('Batch job not found');
      }

      const userId = job.user_id as string;

      // RLS: create user-scoped client for all extraction DB operations
      const userClient = await createUserScopedClient(userId);

      // Update status to processing
      const { error: updateError } = await supabase
        .from('batch_jobs')
        .update({ status: 'processing', processing_started_at: new Date().toISOString() })
        .eq('id', jobId);

      if (updateError) {
        logger.warn('Failed to update batch status to processing', {
          jobId,
          error: updateError.message,
        });
      }

      // Initialize all results as pending
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file) {
          results[i] = {
            filename: `file_${i}`,
            status: 'failed' as const,
            error: 'Missing file entry',
            reviewStatus: 'not_available',
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          };
        } else {
          results[i] = {
            filename: file.name,
            status: 'pending',
            reviewStatus: 'not_available',
          };
        }
      }

      await supabase.from('batch_jobs').update({ results }).eq('id', jobId);

      // Deduct credits upfront for all files (prevents extraction without payment)
      // R-1/R-5 fix: Atomically claim deduction right to prevent double-deduction
      // when recoverStuckJobs() resets a crashed job back to 'pending'
      const totalFiles = files.filter((f) => !!f).length;
      const { data: deductionClaimed, error: claimErr } = await supabase
        .from('batch_jobs')
        .update({ credits_deducted: true })
        .eq('id', jobId)
        .eq('credits_deducted', false)
        .select('id')
        .single();

      if (claimErr || !deductionClaimed) {
        // Credits were already deducted in a previous run — skip deduction
        logger.info('Credits already deducted for batch job (recovery re-run)', { jobId, userId });
      } else {
        const creditsDeducted = await creditsDbService.deductCredits(
          userId,
          totalFiles,
          `batch:deduct:${jobId}`
        );
        if (!creditsDeducted) {
          logger.warn('Insufficient credits for batch', { jobId, userId, totalFiles });
          await supabase
            .from('batch_jobs')
            .update({
              status: 'failed',
              completed_at: new Date().toISOString(),
              error_message: 'Insufficient credits',
            })
            .eq('id', jobId);
          throw new Error('Insufficient credits for batch processing');
        }
      }

      // Process files concurrently with a pool of `concurrency` workers
      const validFiles = files
        .map((file, index) => ({ file, index }))
        .filter(({ file }) => !!file) as {
        file: { name: string; content: Buffer };
        index: number;
      }[];

      // Chunk into groups of `concurrency` and process each group in parallel
      for (let i = 0; i < validFiles.length; i += concurrency) {
        const chunk = validFiles.slice(i, i + concurrency);

        logger.info('Processing file chunk', {
          jobId,
          chunkStart: i,
          chunkSize: chunk.length,
          totalFiles: validFiles.length,
        });

        await Promise.all(
          chunk.map(({ file, index }) =>
            this.processFile(file, index, extractor, userId, jobId, results, supabase, userClient)
          )
        );
      }

      const successCount = results.filter((r) => r.status === 'success').length;
      const failCount = results.filter((r) => r.status === 'failed').length;

      // Deduct extra credits for multi-invoice expansion (1 record for entire batch)
      const extraInvoices = results.length - totalFiles;
      if (extraInvoices > 0) {
        const extraDeducted = await creditsDbService.deductCredits(
          userId,
          extraInvoices,
          `batch:expansion:${jobId}`
        );
        if (!extraDeducted) {
          // Deduct whatever credits remain
          const { data: credits } = await supabase
            .from('user_credits')
            .select('available_credits')
            .eq('user_id', userId)
            .single();
          const available = credits?.available_credits || 0;
          if (available > 0) {
            await creditsDbService.deductCredits(userId, available, `batch:expansion:${jobId}`);
          }
          logger.warn('Insufficient credits for all multi-invoice extras', {
            jobId,
            userId,
            extraInvoices,
            availableCredits: available,
          });
        }
        logger.info('Deducted extra credits for multi-invoice expansion', {
          jobId,
          userId,
          extraInvoices,
        });
      }

      // Refund credits for failed results
      let refundSucceeded = false;
      if (failCount > 0) {
        try {
          await creditsDbService.addCredits(userId, failCount, `batch:refund:${jobId}`, jobId);
          refundSucceeded = true;
          logger.info('Refunded credits for failed batch files', { jobId, userId, failCount });
        } catch (refundErr) {
          logger.error('Failed to refund credits for failed batch files', {
            jobId,
            userId,
            failCount,
            error: refundErr instanceof Error ? refundErr.message : String(refundErr),
          });
        }
      }

      // Compute final status

      let finalStatus: string;
      if (failCount === 0) {
        finalStatus = 'completed';
      } else if (successCount === 0 && refundSucceeded) {
        finalStatus = 'failed_refunded';
      } else if (successCount === 0) {
        finalStatus = 'failed';
      } else {
        finalStatus = 'completed'; // partial success — some completed
      }

      const finalPayload = {
        status: finalStatus,
        completed_at: new Date().toISOString(),
        total_files: results.length,
        completed_files: successCount,
        failed_files: failCount,
        results: results,
      };

      const { error: finalUpdateError } = await supabase
        .from('batch_jobs')
        .update(finalPayload)
        .eq('id', jobId);

      if (finalUpdateError) {
        logger.error('Final status update failed, retrying', {
          jobId,
          finalStatus,
          error: finalUpdateError.message,
        });
        // Retry once with a smaller payload (omit results since they're already stored)
        const { error: retryError } = await supabase
          .from('batch_jobs')
          .update({
            status: finalStatus,
            completed_at: finalPayload.completed_at,
            total_files: results.length,
            completed_files: successCount,
            failed_files: failCount,
          })
          .eq('id', jobId);

        if (retryError) {
          logger.error('Final status update retry also failed', {
            jobId,
            finalStatus,
            error: retryError.message,
          });
        } else {
          logger.info('Final status update succeeded on retry (without results)', {
            jobId,
            finalStatus,
          });
        }
      }

      logger.info('Batch processing completed', {
        jobId,
        status: finalStatus,
        successful: successCount,
        failed: failCount,
      });

      return results;
    } catch (processingError) {
      const errorMessage =
        processingError instanceof Error ? processingError.message : 'Unknown processing error';

      logger.error('Batch processing failed unexpectedly', {
        jobId,
        error: errorMessage,
      });

      await supabase
        .from('batch_jobs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          total_files: results.length,
          completed_files: results.filter((r) => r.status === 'success').length,
          failed_files: results.filter((r) => r.status === 'failed').length,
          results: results,
          error_message: errorMessage,
        })
        .eq('id', jobId);

      throw processingError;
    }
  }
}

export const batchProcessor = new BatchProcessor();
