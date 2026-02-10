import { createServerClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import { ExtractorFactory } from '@/services/ai/extractor.factory';
import { creditsDbService } from '@/services/credits.db.service';
import { invoiceDbService } from '@/services/invoice.db.service';
import { boundaryDetectionService } from '@/services/boundary-detection.service';
import { pdfSplitterService } from '@/services/pdf-splitter.service';
import { BATCH_EXTRACTION, MULTI_INVOICE_CONCURRENCY } from '@/lib/constants';
import { NotFoundError } from '@/lib/errors';
import { BatchResult } from './types';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class BatchProcessor {

    /**
     * Retry extraction with exponential backoff on 429/transient errors.
     */
    private async extractWithRetry(
        extractor: ReturnType<typeof ExtractorFactory.create>,
        fileContent: Buffer,
        fileName: string,
        jobId: string,
    ) {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= BATCH_EXTRACTION.MAX_RETRIES; attempt++) {
            try {
                return await extractor.extractFromFile(fileContent, fileName, 'application/pdf');
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                const errorMessage = lastError.message;

                const isRetryable = errorMessage.includes('429')
                    || errorMessage.includes('rate limit')
                    || errorMessage.includes('quota')
                    || errorMessage.includes('RATE_LIMIT')
                    || errorMessage.includes('Too Many Requests')
                    || errorMessage.includes('503')
                    || errorMessage.includes('overloaded');

                if (!isRetryable || attempt === BATCH_EXTRACTION.MAX_RETRIES) {
                    throw lastError;
                }

                const backoffMs = Math.min(
                    BATCH_EXTRACTION.INITIAL_BACKOFF_MS * Math.pow(BATCH_EXTRACTION.BACKOFF_MULTIPLIER, attempt),
                    BATCH_EXTRACTION.MAX_BACKOFF_MS,
                );

                logger.warn('AI API rate limited, retrying with backoff', {
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
        supabase: ReturnType<typeof createServerClient>,
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
                const pageGroups = boundaryResult.invoices.map(inv => inv.pages);
                const splitBuffers = await pdfSplitterService.splitByPageGroups(file.content, pageGroups);

                logger.info('Multi-invoice PDF detected in batch', {
                    jobId,
                    filename: file.name,
                    invoiceCount: boundaryResult.totalInvoices,
                });

                // Process segments in parallel chunks
                const segments = splitBuffers.map((buf, s) => ({ buf, s }));
                for (let c = 0; c < segments.length; c += MULTI_INVOICE_CONCURRENCY) {
                    const chunk = segments.slice(c, c + MULTI_INVOICE_CONCURRENCY);
                    await Promise.all(chunk.map(async ({ buf, s }) => {
                        const invoice = boundaryResult.invoices[s]!;
                        const segmentName = `${file.name} [${invoice.label}]`;

                        try {
                            const extractedData = await this.extractWithRetry(extractor, buf, segmentName, jobId);
                            const extraction = await invoiceDbService.createExtraction({
                                userId,
                                extractionData: extractedData as unknown as Record<string, unknown>,
                                confidenceScore: extractedData.confidence,
                                status: 'draft',
                            });
                            const segmentResult: BatchResult = {
                                filename: segmentName,
                                status: 'success' as const,
                                invoiceNumber: extractedData.invoiceNumber || undefined,
                                extractionId: extraction.id,
                                confidenceScore: typeof extractedData.confidence === 'number' ? extractedData.confidence : undefined,
                                reviewStatus: 'pending_review',
                                startedAt,
                                completedAt: new Date().toISOString(),
                            };

                            if (s === 0) {
                                results[index] = segmentResult;
                            } else {
                                results.push(segmentResult);
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
                                results[index] = segmentResult;
                            } else {
                                results.push(segmentResult);
                            }
                        }
                    }));
                }
                return;
            }

            // Single invoice (existing flow)
            const extractedData = await this.extractWithRetry(extractor, file.content, file.name, jobId);

            const extraction = await invoiceDbService.createExtraction({
                userId,
                extractionData: extractedData as unknown as Record<string, unknown>,
                confidenceScore: extractedData.confidence,
                status: 'draft',
            });

            results[index] = {
                filename: file.name,
                status: 'success' as const,
                invoiceNumber: extractedData.invoiceNumber || undefined,
                extractionId: extraction.id,
                confidenceScore: typeof extractedData.confidence === 'number' ? extractedData.confidence : undefined,
                reviewStatus: 'pending_review',
                startedAt,
                completedAt: new Date().toISOString(),
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to process file', {
                jobId,
                filename: file.name,
                error: errorMessage,
            });

            results[index] = {
                filename: file.name,
                status: 'failed' as const,
                error: errorMessage,
                reviewStatus: 'not_available',
                startedAt,
                completedAt: new Date().toISOString(),
            };
        }

        // Update progress after each file completes
        const successCount = results.filter(r => r.status === 'success').length;
        const failCount = results.filter(r => r.status === 'failed').length;

        await supabase
            .from('batch_jobs')
            .update({
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
        files: { name: string; content: Buffer }[],
        format: 'CII' | 'UBL' = 'CII'
    ): Promise<BatchResult[]> {
        const concurrency = BATCH_EXTRACTION.CONCURRENCY;
        logger.info('Processing batch', { jobId, fileCount: files.length, format, concurrency });

        const supabase = createServerClient();
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

            // Update status to processing
            const { error: updateError } = await supabase
                .from('batch_jobs')
                .update({ status: 'processing', processing_started_at: new Date().toISOString() })
                .eq('id', jobId);

            if (updateError) {
                logger.warn('Failed to update batch status to processing', { jobId, error: updateError.message });
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

            await supabase
                .from('batch_jobs')
                .update({ results })
                .eq('id', jobId);

            // Deduct credits upfront for all files (prevents extraction without payment)
            const totalFiles = files.filter(f => !!f).length;
            const creditsDeducted = await creditsDbService.deductCredits(userId, totalFiles, `batch:${jobId}`);
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

            // Process files concurrently with a pool of `concurrency` workers
            const validFiles = files
                .map((file, index) => ({ file, index }))
                .filter(({ file }) => !!file) as { file: { name: string; content: Buffer }; index: number }[];

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
                        this.processFile(file, index, extractor, userId, jobId, results, supabase)
                    )
                );
            }

            // Credits were deducted upfront — refund for failed files
            const successCount = results.filter(r => r.status === 'success').length;
            const failCount = results.filter(r => r.status === 'failed').length;

            if (failCount > 0) {
                try {
                    await creditsDbService.addCredits(userId, failCount, 'batch_refund', jobId);
                    logger.info('Refunded credits for failed batch files', { jobId, userId, failCount });
                } catch (refundErr) {
                    logger.error('Failed to refund credits for failed batch files', {
                        jobId, userId, failCount,
                        error: refundErr instanceof Error ? refundErr.message : String(refundErr),
                    });
                }
            }

            // Compute final status

            let finalStatus: string;
            if (failCount === 0) {
                finalStatus = 'completed';
            } else if (successCount === 0) {
                finalStatus = 'failed';
            } else {
                finalStatus = 'partial_success';
            }

            await supabase
                .from('batch_jobs')
                .update({
                    status: finalStatus,
                    completed_at: new Date().toISOString(),
                    completed_files: successCount,
                    failed_files: failCount,
                    results: results,
                })
                .eq('id', jobId);

            logger.info('Batch processing completed', {
                jobId,
                status: finalStatus,
                successful: successCount,
                failed: failCount,
            });

            return results;

        } catch (processingError) {
            const errorMessage = processingError instanceof Error
                ? processingError.message
                : 'Unknown processing error';

            logger.error('Batch processing failed unexpectedly', {
                jobId,
                error: errorMessage,
            });

            await supabase
                .from('batch_jobs')
                .update({
                    status: 'failed',
                    completed_at: new Date().toISOString(),
                    completed_files: results.filter(r => r.status === 'success').length,
                    failed_files: results.filter(r => r.status === 'failed').length,
                    results: results,
                    error_message: errorMessage,
                })
                .eq('id', jobId);

            throw processingError;
        }
    }
}

export const batchProcessor = new BatchProcessor();
