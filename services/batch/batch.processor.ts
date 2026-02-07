import { createServerClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import { ExtractorFactory } from '@/services/ai/extractor.factory';
import { creditsDbService } from '@/services/credits.db.service';
import { xrechnungService } from '@/services/xrechnung.service';
import { ublService } from '@/services/ubl.service';
import { BatchResult } from './types';

export class BatchProcessor {
    constructor(
        private xService = xrechnungService,
        private uService = ublService
    ) { }

    /**
     * Process batch job
     * FIX (BUG-020/021/022): Improved status management and progress tracking
     */
    async processBatch(
        jobId: string,
        files: { name: string; content: Buffer }[],
        format: 'CII' | 'UBL' = 'CII'
    ): Promise<BatchResult[]> {
        logger.info('Processing batch', { jobId, fileCount: files.length, format });

        const supabase = createServerClient();
        const results: BatchResult[] = [];
        const extractor = ExtractorFactory.create();

        // FIX (BUG-020): Wrap entire processing in try/catch to handle unexpected failures
        try {
            // Fetch batch job owner for credit deduction
            const { data: job, error: jobError } = await supabase
                .from('batch_jobs')
                .select('user_id')
                .eq('id', jobId)
                .single();

            if (jobError || !job?.user_id) {
                logger.error('Failed to resolve batch job owner', { jobId, error: jobError?.message });
                throw new Error('Batch job not found');
            }

            const userId = job.user_id as string;

            // Update status to processing
            await supabase
                .from('batch_jobs')
                .update({ status: 'processing', processing_started_at: new Date().toISOString() })
                .eq('id', jobId);

            // FIX (BUG-022): Process files sequentially with progress updates
            for (let index = 0; index < files.length; index++) {
                const file = files[index];
                logger.info('Processing file', { jobId, filename: file.name, index: index + 1, total: files.length });

                let result: BatchResult;

                try {
                    // Extract invoice data using AI
                    const extractedData = await extractor.extractFromFile(file.content, file.name, 'application/pdf');

                    // Deduct credits AFTER successful extraction
                    const deducted = await creditsDbService.deductCredits(userId, 1, 'batch_extraction');
                    if (!deducted) {
                        result = {
                            filename: file.name,
                            status: 'failed' as const,
                            error: 'Insufficient credits during batch processing',
                        };
                        results.push(result);

                        // Update progress after failure
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

                        continue;
                    }

                    // Generate XML based on format
                    let xml: string;
                    if (format === 'UBL') {
                        xml = await this.uService.generate({
                            invoiceNumber: extractedData.invoiceNumber || `INV-${Date.now()}`,
                            invoiceDate: extractedData.invoiceDate || new Date().toISOString().split('T')[0],
                            currency: extractedData.currency || 'EUR',
                            sellerName: extractedData.sellerName || '',
                            sellerEmail: extractedData.sellerEmail || '',
                            sellerTaxId: extractedData.sellerTaxId || '',
                            sellerAddress: extractedData.sellerAddress || undefined,
                            sellerCountryCode: 'DE',
                            buyerName: extractedData.buyerName || '',
                            buyerEmail: extractedData.buyerEmail || undefined,
                            buyerAddress: extractedData.buyerAddress || undefined,
                            buyerCountryCode: 'DE',
                            lineItems: (extractedData.lineItems || []).map(item => ({
                                description: item.description || '',
                                quantity: item.quantity || 1,
                                unitPrice: item.unitPrice || 0,
                                totalPrice: item.totalPrice || 0,
                            })),
                            subtotal: extractedData.subtotal || 0,
                            taxAmount: extractedData.taxAmount || 0,
                            totalAmount: extractedData.totalAmount || 0,
                        });
                    } else {
                        const xResult = this.xService.generateXRechnung(extractedData);
                        xml = xResult.xmlContent;
                    }

                    result = {
                        filename: file.name,
                        status: 'success' as const,
                        invoiceNumber: extractedData.invoiceNumber || undefined,
                        xmlContent: xml,
                    };
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    logger.error('Failed to process file', { jobId, filename: file.name, error: errorMessage });

                    result = {
                        filename: file.name,
                        status: 'failed' as const,
                        error: errorMessage,
                    };
                }

                results.push(result);

                // FIX (BUG-022): Update progress after each file
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

            // FIX (BUG-021): Use proper status based on results
            const successCount = results.filter(r => r.status === 'success').length;
            const failCount = results.filter(r => r.status === 'failed').length;

            let finalStatus: string;
            if (failCount === 0) {
                finalStatus = 'completed'; // All succeeded
            } else if (successCount === 0) {
                finalStatus = 'failed'; // All failed
            } else {
                finalStatus = 'partial_success'; // Some succeeded, some failed
            }

            // Mark job as completed with final status
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
            // FIX (BUG-020): Mark job as failed if unexpected error occurs
            const errorMessage = processingError instanceof Error
                ? processingError.message
                : 'Unknown processing error';

            logger.error('Batch processing failed unexpectedly', {
                jobId,
                error: errorMessage,
                processedSoFar: results.length
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
