import { createServerClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import JSZip from 'jszip';
import { BatchJob, BatchProgress, BatchResult } from './types';
import { batchProcessor } from './batch.processor';
import { batchGenerator } from './batch.generator';
import { AppError, ValidationError } from '@/lib/errors';
import { MAX_CONCURRENT_BATCH_JOBS, MULTI_INVOICE_CONCURRENCY } from '@/lib/constants';
import { ExtractorFactory } from '@/services/ai/extractor.factory';
import { invoiceDbService } from '@/services/invoice.db.service';
import { creditsDbService } from '@/services/credits.db.service';
import { pdfSplitterService } from '@/services/pdf-splitter.service';

type BatchJobRow = {
    id: string;
    user_id: string;
    status: string;
    total_files: number;
    completed_files: number;
    failed_files: number;
    results: BatchResult[] | null;
    input_file_path?: string | null;
    source_type?: string | null;
    boundary_data?: Record<string, unknown> | null;
    created_at: string;
    completed_at?: string | null;
};

type ParsedZip = {
    files: { name: string; content: Buffer }[];
    totalExtractedSize: number;
};

export class BatchService {
    private readonly MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB per file
    private readonly MAX_TOTAL_SIZE = 500 * 1024 * 1024; // 500MB total batch
    private readonly MAX_FILES = 100;
    private readonly INPUT_BUCKET = 'batch-inputs';
    private bucketEnsured = false;

    private getSupabase() {
        return createServerClient();
    }

    private async ensureInputBucket(): Promise<void> {
        if (this.bucketEnsured) return;
        const supabase = this.getSupabase();

        const { data: buckets, error: listError } = await supabase.storage.listBuckets();
        if (listError) {
            throw new AppError('STORAGE_ERROR', `Failed to list storage buckets: ${listError.message}`, 500);
        }

        const exists = (buckets || []).some((bucket: { name: string }) => bucket.name === this.INPUT_BUCKET);
        if (!exists) {
            const { error: createError } = await supabase.storage.createBucket(this.INPUT_BUCKET, {
                public: false,
                fileSizeLimit: `${this.MAX_TOTAL_SIZE}`,
            });

            if (createError && !String(createError.message || '').toLowerCase().includes('already exists')) {
                throw new AppError('STORAGE_ERROR', `Failed to create storage bucket: ${createError.message}`, 500);
            }
        }

        this.bucketEnsured = true;
    }

    private async parseZip(zipBuffer: Buffer): Promise<ParsedZip> {
        if (zipBuffer.length > this.MAX_TOTAL_SIZE) {
            throw new ValidationError(`ZIP file too large. Maximum size is ${this.MAX_TOTAL_SIZE / 1024 / 1024}MB`);
        }

        const zip = await JSZip.loadAsync(zipBuffer);
        const files: { name: string; content: Buffer }[] = [];
        let totalExtractedSize = 0;

        for (const [filename, file] of Object.entries(zip.files)) {
            if (!file.dir && filename.toLowerCase().endsWith('.pdf')) {
                // FIX-029: Sanitize ZIP filenames to prevent path traversal
                const safeName = filename.split('/').pop() || filename;
                if (safeName.includes('..') || safeName.startsWith('/') || safeName.startsWith('\\')) {
                    logger.warn('Skipping suspicious ZIP entry', { filename });
                    continue;
                }

                if (files.length >= this.MAX_FILES) {
                    throw new ValidationError(`Maximum ${this.MAX_FILES} PDF files allowed per batch`);
                }

                const content = await file.async('nodebuffer');
                if (content.length > this.MAX_FILE_SIZE) {
                    throw new ValidationError(
                        `File "${filename}" (${Math.round(content.length / 1024 / 1024)}MB) exceeds maximum of ${this.MAX_FILE_SIZE / 1024 / 1024}MB`
                    );
                }

                totalExtractedSize += content.length;
                if (totalExtractedSize > this.MAX_TOTAL_SIZE) {
                    throw new ValidationError(`Total batch size exceeds ${this.MAX_TOTAL_SIZE / 1024 / 1024}MB limit`);
                }

                files.push({ name: safeName, content });
            }
        }

        if (files.length === 0) {
            throw new ValidationError('No PDF files found in ZIP archive');
        }

        return { files, totalExtractedSize };
    }

    private async uploadInputZip(path: string, zipBuffer: Buffer): Promise<void> {
        await this.ensureInputBucket();
        const supabase = this.getSupabase();

        const { error } = await supabase.storage
            .from(this.INPUT_BUCKET)
            .upload(path, zipBuffer, {
                contentType: 'application/zip',
                upsert: true,
            });

        if (error) {
            throw new AppError('STORAGE_ERROR', `Failed to upload input ZIP: ${error.message}`, 500);
        }
    }

    private async downloadInputZip(path: string): Promise<Buffer> {
        await this.ensureInputBucket();
        const supabase = this.getSupabase();

        const { data, error } = await supabase.storage
            .from(this.INPUT_BUCKET)
            .download(path);

        if (error || !data) {
            throw new AppError('STORAGE_ERROR', `Failed to download input ZIP: ${error?.message || 'Missing file'}`, 500);
        }

        const arrayBuffer = await data.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }

    /**
     * Estimate number of PDF files in ZIP without creating a job.
     */
    async estimateFileCount(zipBuffer: Buffer): Promise<number> {
        const { files } = await this.parseZip(zipBuffer);
        return files.length;
    }

    /**
     * Parse ZIP file, store payload, and create queue job.
     */
    async createBatchJob(userId: string, zipBuffer: Buffer): Promise<BatchJob> {
        logger.info('Creating batch job', { userId, zipSize: zipBuffer.length });

        // FIX-030: Check concurrent batch job limit
        const supabaseCheck = this.getSupabase();
        const { count: activeJobCount, error: countError } = await supabaseCheck
            .from('batch_jobs')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .in('status', ['pending', 'processing']);

        if (countError) {
            logger.error('Failed to check active batch jobs', { userId, error: countError.message });
        }

        if ((activeJobCount || 0) >= MAX_CONCURRENT_BATCH_JOBS) {
            throw new ValidationError(
                `Maximum ${MAX_CONCURRENT_BATCH_JOBS} concurrent batch jobs allowed. Please wait for existing jobs to complete.`
            );
        }

        const { files, totalExtractedSize } = await this.parseZip(zipBuffer);
        logger.info('PDF files validated', {
            fileCount: files.length,
            totalSizeMB: Math.round(totalExtractedSize / 1024 / 1024),
        });

        const supabase = this.getSupabase();
        const initialResults: BatchResult[] = files.map((file) => ({
            filename: file.name,
            status: 'pending',
            reviewStatus: 'not_available',
        }));

        const { data: job, error } = await supabase
            .from('batch_jobs')
            .insert({
                user_id: userId,
                status: 'pending',
                total_files: files.length,
                completed_files: 0,
                failed_files: 0,
                results: initialResults,
            })
            .select()
            .single();

        if (error || !job) {
            logger.error('Failed to create batch job', { error });
            throw new AppError('DATABASE_ERROR', `Failed to create batch job: ${error?.message || 'unknown error'}`, 500);
        }

        const inputPath = `${userId}/${job.id}/input.zip`;
        await this.uploadInputZip(inputPath, zipBuffer);

        const { error: pathError } = await supabase
            .from('batch_jobs')
            .update({ input_file_path: inputPath })
            .eq('id', job.id);

        if (pathError) {
            logger.error('Failed to update batch input file path', { jobId: job.id, error: pathError.message });
            throw new AppError('DATABASE_ERROR', `Failed to update batch input path: ${pathError.message}`, 500);
        }

        logger.info('Batch job created', { jobId: job.id, totalFiles: files.length, inputPath });

        return {
            id: job.id,
            userId: job.user_id,
            status: job.status as BatchJob['status'],
            totalFiles: job.total_files,
            completedFiles: job.completed_files,
            failedFiles: job.failed_files,
            results: (job.results as BatchResult[] | null) || initialResults,
            createdAt: job.created_at,
        };
    }

    /**
     * Create a background job for multi-invoice PDF splitting + extraction.
     */
    async createMultiInvoiceJob(
        userId: string,
        pdfBuffer: Buffer,
        boundaryData: Record<string, unknown>,
        totalInvoices: number,
    ): Promise<{ jobId: string }> {
        logger.info('Creating multi-invoice background job', { userId, totalInvoices });

        const supabase = this.getSupabase();

        const { data: job, error } = await supabase
            .from('batch_jobs')
            .insert({
                user_id: userId,
                status: 'pending',
                total_files: totalInvoices,
                completed_files: 0,
                failed_files: 0,
                results: [],
                source_type: 'multi_invoice_split',
                boundary_data: boundaryData,
            })
            .select()
            .single();

        if (error || !job) {
            throw new AppError('DATABASE_ERROR', `Failed to create multi-invoice job: ${error?.message || 'unknown'}`, 500);
        }

        const inputPath = `${userId}/${job.id}/input.pdf`;
        await this.uploadInputFile(inputPath, pdfBuffer, 'application/pdf');

        await supabase
            .from('batch_jobs')
            .update({ input_file_path: inputPath })
            .eq('id', job.id);

        logger.info('Multi-invoice job created', { jobId: job.id, totalInvoices, inputPath });
        return { jobId: job.id };
    }

    /**
     * Process a multi-invoice split job: download PDF, split, extract in parallel.
     */
    async processMultiInvoiceJob(jobId: string): Promise<void> {
        const supabase = this.getSupabase();

        const { data: job, error: jobError } = await supabase
            .from('batch_jobs')
            .select('*')
            .eq('id', jobId)
            .single();

        if (jobError || !job) {
            throw new AppError('DATABASE_ERROR', `Multi-invoice job not found: ${jobId}`, 500);
        }

        const userId = job.user_id as string;
        const inputPath = job.input_file_path as string;
        const boundaryData = job.boundary_data as { invoices: { pages: number[]; label: string }[] } | null;

        if (!inputPath || !boundaryData?.invoices) {
            throw new ValidationError('Missing input path or boundary data for multi-invoice job');
        }

        // Download PDF
        const pdfBuffer = await this.downloadInputFile(inputPath);

        // Split by page groups
        const pageGroups = boundaryData.invoices.map(inv => inv.pages);
        const splitBuffers = await pdfSplitterService.splitByPageGroups(pdfBuffer, pageGroups);

        const extractor = ExtractorFactory.create();
        const results: BatchResult[] = [];
        let completedFiles = 0;
        let failedFiles = 0;

        // Process segments in parallel chunks
        const segments = splitBuffers.map((buf, i) => ({ buf, i }));
        for (let c = 0; c < segments.length; c += MULTI_INVOICE_CONCURRENCY) {
            const chunk = segments.slice(c, c + MULTI_INVOICE_CONCURRENCY);

            await Promise.all(chunk.map(async ({ buf, i }) => {
                const invoice = boundaryData.invoices[i]!;
                const segmentName = `Invoice [${invoice.label}]`;

                try {
                    const extractedData = await extractor.extractFromFile(buf, segmentName, 'application/pdf');

                    const extraction = await invoiceDbService.createExtraction({
                        userId,
                        extractionData: extractedData as unknown as Record<string, unknown>,
                        confidenceScore: extractedData.confidence,
                        status: 'draft',
                    });

                    results.push({
                        filename: segmentName,
                        status: 'success',
                        invoiceNumber: extractedData.invoiceNumber || undefined,
                        extractionId: extraction.id,
                        confidenceScore: typeof extractedData.confidence === 'number' ? extractedData.confidence : undefined,
                        reviewStatus: 'pending_review',
                        completedAt: new Date().toISOString(),
                    });
                    completedFiles++;
                } catch (err) {
                    const errMsg = err instanceof Error ? err.message : 'Unknown error';
                    results.push({
                        filename: segmentName,
                        status: 'failed',
                        error: errMsg,
                        reviewStatus: 'not_available',
                        completedAt: new Date().toISOString(),
                    });
                    failedFiles++;
                }
            }));

            // Update progress after each chunk
            const { error: progressError } = await supabase
                .from('batch_jobs')
                .update({
                    completed_files: completedFiles,
                    failed_files: failedFiles,
                    results,
                })
                .eq('id', jobId);

            if (progressError) {
                logger.error('Failed to update batch job progress', {
                    jobId, completedFiles, failedFiles, error: progressError.message,
                });
            }
        }

        // Deduct credits once for all successful extractions
        if (completedFiles > 0) {
            await creditsDbService.deductCredits(userId, completedFiles, `batch:${jobId}`);
        }

        // Final status
        const finalStatus = failedFiles === 0
            ? 'completed'
            : completedFiles === 0
                ? 'failed'
                : 'partial_success';

        await supabase
            .from('batch_jobs')
            .update({
                status: finalStatus,
                completed_files: completedFiles,
                failed_files: failedFiles,
                results,
                completed_at: new Date().toISOString(),
            })
            .eq('id', jobId);

        logger.info('Multi-invoice job completed', {
            jobId,
            status: finalStatus,
            completed: completedFiles,
            failed: failedFiles,
        });
    }

    private async uploadInputFile(path: string, buffer: Buffer, contentType: string): Promise<void> {
        await this.ensureInputBucket();
        const supabase = this.getSupabase();

        const { error } = await supabase.storage
            .from(this.INPUT_BUCKET)
            .upload(path, buffer, { contentType, upsert: true });

        if (error) {
            throw new AppError('STORAGE_ERROR', `Failed to upload input file: ${error.message}`, 500);
        }
    }

    private async downloadInputFile(path: string): Promise<Buffer> {
        await this.ensureInputBucket();
        const supabase = this.getSupabase();

        const { data, error } = await supabase.storage
            .from(this.INPUT_BUCKET)
            .download(path);

        if (error || !data) {
            throw new AppError('STORAGE_ERROR', `Failed to download input file: ${error?.message || 'Missing file'}`, 500);
        }

        const arrayBuffer = await data.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }

    /**
     * Delegates to BatchProcessor.
     */
    async processBatch(
        jobId: string,
        files: { name: string; content: Buffer }[],
        format: 'CII' | 'UBL' = 'CII'
    ): Promise<BatchResult[]> {
        return batchProcessor.processBatch(jobId, files, format);
    }

    /**
     * Recover batch jobs stuck in 'processing' state (EXP-1 fix).
     * If processing_started_at is older than threshold, reset to pending.
     * If total job age exceeds 3x threshold, mark as failed instead.
     */
    async recoverStuckJobs(thresholdMs: number = 300000): Promise<number> {
        const supabase = this.getSupabase();
        const cutoff = new Date(Date.now() - thresholdMs).toISOString();

        const { data: stuckJobs, error } = await supabase
            .from('batch_jobs')
            .select('id, created_at, processing_started_at')
            .eq('status', 'processing')
            .lt('processing_started_at', cutoff);

        if (error) {
            logger.error('Failed to query stuck batch jobs', { error: error.message });
            return 0;
        }

        if (!stuckJobs?.length) return 0;

        let recovered = 0;
        for (const job of stuckJobs) {
            const ageMs = Date.now() - new Date(job.created_at).getTime();

            if (ageMs > thresholdMs * 3) {
                // Job has been around too long — give up
                await supabase
                    .from('batch_jobs')
                    .update({
                        status: 'failed',
                        error_message: 'Job stuck in processing — exceeded maximum recovery attempts',
                        completed_at: new Date().toISOString(),
                    })
                    .eq('id', job.id)
                    .eq('status', 'processing');
                logger.warn('Stuck batch job marked as failed', { jobId: job.id, ageMs });
            } else {
                // Reset for another attempt
                await supabase
                    .from('batch_jobs')
                    .update({ status: 'pending', processing_started_at: null })
                    .eq('id', job.id)
                    .eq('status', 'processing');
                logger.info('Stuck batch job reset to pending', { jobId: job.id, ageMs });
            }
            recovered++;
        }

        if (recovered > 0) {
            logger.info('Recovered stuck batch jobs', { recovered });
        }
        return recovered;
    }

    /**
     * Pick and process one pending job from the queue.
     */
    async runWorkerOnce(): Promise<boolean> {
        const supabase = this.getSupabase();
        const { data: pending, error: pendingError } = await supabase
            .from('batch_jobs')
            .select('id')
            .eq('status', 'pending')
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

        if (pendingError) {
            logger.error('Failed to query pending batch jobs', { error: pendingError.message });
            throw new AppError('DATABASE_ERROR', `Failed to query pending jobs: ${pendingError.message}`, 500);
        }

        if (!pending?.id) {
            return false;
        }

        const { data: claimed, error: claimError } = await supabase
            .from('batch_jobs')
            .update({
                status: 'processing',
                processing_started_at: new Date().toISOString(),
            })
            .eq('id', pending.id)
            .eq('status', 'pending')
            .select('id, user_id, input_file_path, source_type')
            .maybeSingle();

        if (claimError) {
            logger.warn('Failed to claim pending batch job', { jobId: pending.id, error: claimError.message });
            return false;
        }
        if (!claimed?.id) {
            return false;
        }

        const jobId = claimed.id as string;
        const sourceType = (claimed.source_type as string) || 'zip_upload';
        try {
            if (sourceType === 'multi_invoice_split') {
                await this.processMultiInvoiceJob(jobId);
                logger.info('Worker processed multi-invoice job', { jobId, userId: claimed.user_id });
                return true;
            }

            const inputPath = claimed.input_file_path as string | null;
            if (!inputPath) {
                throw new ValidationError('Missing input ZIP path for batch job');
            }

            const zipBuffer = await this.downloadInputZip(inputPath);
            const parsed = await this.parseZip(zipBuffer);
            await this.processBatch(jobId, parsed.files, 'CII');

            logger.info('Worker processed batch job', {
                jobId,
                userId: claimed.user_id,
                fileCount: parsed.files.length,
            });
            return true;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error('Worker failed to process batch job', { jobId, error: message });

            await supabase
                .from('batch_jobs')
                .update({
                    status: 'failed',
                    error_message: message,
                    completed_at: new Date().toISOString(),
                })
                .eq('id', jobId);
            return true;
        }
    }

    /**
     * Get batch job status for current user.
     */
    async getBatchStatus(userId: string, jobId: string): Promise<BatchProgress | null> {
        const supabase = this.getSupabase();

        const { data: job, error } = await supabase
            .from('batch_jobs')
            .select('*')
            .eq('id', jobId)
            .eq('user_id', userId)
            .single();

        if (error || !job) {
            return null;
        }

        const progress = job.total_files > 0
            ? Math.round((job.completed_files / job.total_files) * 100)
            : 0;

        return {
            id: job.id,
            status: job.status,
            totalFiles: job.total_files,
            completedFiles: job.completed_files,
            failedFiles: job.failed_files,
            progress,
            results: (job.results as BatchResult[] | null) || [],
            createdAt: job.created_at,
        };
    }

    /**
     * Generate output ZIP with all converted XMLs.
     */
    async generateOutputZip(results: BatchResult[]): Promise<Buffer> {
        return batchGenerator.generateOutputZip(results);
    }

    /**
     * Cancel batch job.
     */
    async cancelBatchJob(userId: string, jobId: string): Promise<boolean> {
        const supabase = this.getSupabase();

        const { error } = await supabase
            .from('batch_jobs')
            .update({ status: 'cancelled' })
            .eq('id', jobId)
            .eq('user_id', userId)
            .in('status', ['pending', 'processing']);

        return !error;
    }

    /**
     * List user jobs.
     */
    async listBatchJobs(
        userId: string,
        page: number = 1,
        limit: number = 10
    ): Promise<{ jobs: BatchJob[]; total: number }> {
        const supabase = this.getSupabase();
        const offset = (page - 1) * limit;

        const { data, count, error } = await supabase
            .from('batch_jobs')
            .select('*', { count: 'exact' })
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            logger.error('Failed to list batch jobs', { error, userId, page, limit });
            throw new AppError('DATABASE_ERROR', `Failed to list batch jobs: ${error.message}`, 500);
        }

        const jobs: BatchJob[] = (data || []).map((row: BatchJobRow) => ({
            id: row.id,
            userId: row.user_id,
            status: row.status as BatchJob['status'],
            totalFiles: row.total_files,
            completedFiles: row.completed_files,
            failedFiles: row.failed_files,
            results: row.results || [],
            createdAt: row.created_at,
            completedAt: row.completed_at || undefined,
        }));

        return { jobs, total: count || 0 };
    }
}

export const batchService = new BatchService();
