import { createServerClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import JSZip from 'jszip';
import { BatchJob, BatchProgress, BatchResult } from './types';
import { batchProcessor } from './batch.processor';
import { batchGenerator } from './batch.generator';

type BatchJobRow = {
    id: string;
    user_id: string;
    status: string;
    total_files: number;
    completed_files: number;
    failed_files: number;
    results: BatchResult[] | null;
    created_at: string;
    completed_at?: string | null;
};

export class BatchService {
    // FIX (BUG-012/013): Size limits to prevent memory exhaustion and DoS
    private readonly MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB per file
    private readonly MAX_TOTAL_SIZE = 500 * 1024 * 1024; // 500MB total batch
    private readonly MAX_FILES = 100;

    /**
     * Estimate number of PDF files in ZIP without creating a job
     * Used for credit checking BEFORE job creation to avoid orphan jobs
     */
    async estimateFileCount(zipBuffer: Buffer): Promise<number> {
        // Check ZIP size before processing
        if (zipBuffer.length > this.MAX_TOTAL_SIZE) {
            throw new Error(`ZIP file too large. Maximum size is ${this.MAX_TOTAL_SIZE / 1024 / 1024}MB`);
        }

        const zip = await JSZip.loadAsync(zipBuffer);
        let pdfCount = 0;

        for (const [filename, file] of Object.entries(zip.files)) {
            if (!file.dir && filename.toLowerCase().endsWith('.pdf')) {
                pdfCount++;
                if (pdfCount > this.MAX_FILES) {
                    throw new Error(`Maximum ${this.MAX_FILES} PDF files allowed per batch`);
                }
            }
        }

        if (pdfCount === 0) {
            throw new Error('No PDF files found in ZIP archive');
        }

        return pdfCount;
    }

    /**
     * Parse ZIP file and create batch job
     * FIX (BUG-012/013): Added file size validation to prevent memory exhaustion
     */
    async createBatchJob(userId: string, zipBuffer: Buffer): Promise<BatchJob> {
        logger.info('Creating batch job', { userId, zipSize: zipBuffer.length });

        // FIX: Check ZIP size before processing
        if (zipBuffer.length > this.MAX_TOTAL_SIZE) {
            throw new Error(`ZIP file too large. Maximum size is ${this.MAX_TOTAL_SIZE / 1024 / 1024}MB`);
        }

        // Parse ZIP
        const zip = await JSZip.loadAsync(zipBuffer);
        const pdfFiles: { name: string; content: Buffer }[] = [];
        let totalExtractedSize = 0;

        // Extract PDF files with size validation
        for (const [filename, file] of Object.entries(zip.files)) {
            if (!file.dir && filename.toLowerCase().endsWith('.pdf')) {
                // FIX (BUG-013): Check file count BEFORE extracting more
                if (pdfFiles.length >= this.MAX_FILES) {
                    throw new Error(`Maximum ${this.MAX_FILES} PDF files allowed per batch`);
                }

                const content = await file.async('nodebuffer');

                // FIX (BUG-013): Validate individual file size
                if (content.length > this.MAX_FILE_SIZE) {
                    throw new Error(
                        `File "${filename}" (${Math.round(content.length / 1024 / 1024)}MB) exceeds maximum of ${this.MAX_FILE_SIZE / 1024 / 1024}MB`
                    );
                }

                // FIX (BUG-012): Track total size to prevent memory exhaustion
                totalExtractedSize += content.length;
                if (totalExtractedSize > this.MAX_TOTAL_SIZE) {
                    throw new Error(
                        `Total batch size exceeds ${this.MAX_TOTAL_SIZE / 1024 / 1024}MB limit`
                    );
                }

                pdfFiles.push({ name: filename, content });
            }
        }

        if (pdfFiles.length === 0) {
            throw new Error('No PDF files found in ZIP archive');
        }

        logger.info('PDF files validated', {
            fileCount: pdfFiles.length,
            totalSizeMB: Math.round(totalExtractedSize / 1024 / 1024)
        });

        // Create batch job in database
        const supabase = createServerClient();
        const { data: job, error } = await supabase
            .from('batch_jobs')
            .insert({
                user_id: userId,
                status: 'pending',
                total_files: pdfFiles.length,
                completed_files: 0,
                failed_files: 0,
                results: pdfFiles.map(f => ({
                    filename: f.name,
                    status: 'pending',
                })),
            })
            .select()
            .single();

        if (error) {
            logger.error('Failed to create batch job', { error });
            throw new Error(`Failed to create batch job: ${error.message}`);
        }

        // Store files temporarily for processing
        // In production, store in cloud storage (S3, GCS)
        await this.storeFilesForProcessing(job.id, pdfFiles);

        logger.info('Batch job created', { jobId: job.id, totalFiles: pdfFiles.length });

        return {
            id: job.id,
            userId: job.user_id,
            status: job.status,
            totalFiles: job.total_files,
            completedFiles: job.completed_files,
            failedFiles: job.failed_files,
            results: job.results || [],
            createdAt: job.created_at,
        };
    }

    /**
     * Process batch job
     * Delegates to BatchProcessor
     */
    async processBatch(
        jobId: string,
        files: { name: string; content: Buffer }[],
        format: 'CII' | 'UBL' = 'CII'
    ): Promise<BatchResult[]> {
        return batchProcessor.processBatch(jobId, files, format);
    }

    /**
     * Get batch job status
     */
    async getBatchStatus(userId: string, jobId: string): Promise<BatchProgress | null> {
        const supabase = createServerClient();

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
            results: job.results || [],
        };
    }

    /**
     * Generate output ZIP with all converted XMLs
     * Delegates to BatchGenerator
     */
    async generateOutputZip(results: BatchResult[]): Promise<Buffer> {
        return batchGenerator.generateOutputZip(results);
    }

    /**
     * Cancel batch job
     */
    async cancelBatchJob(userId: string, jobId: string): Promise<boolean> {
        const supabase = createServerClient();

        const { error } = await supabase
            .from('batch_jobs')
            .update({ status: 'cancelled' })
            .eq('id', jobId)
            .eq('user_id', userId)
            .in('status', ['pending', 'processing']);

        return !error;
    }

    /**
     * List user's batch jobs
     */
    async listBatchJobs(
        userId: string,
        page: number = 1,
        limit: number = 10
    ): Promise<{ jobs: BatchJob[]; total: number }> {
        const supabase = createServerClient();
        const offset = (page - 1) * limit;

        const { data, count, error } = await supabase
            .from('batch_jobs')
            .select('*', { count: 'exact' })
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            throw new Error(`Failed to list batch jobs: ${error.message}`);
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

    /**
     * Store files for processing (temporary storage)
     */
    private async storeFilesForProcessing(
        jobId: string,
        files: { name: string; content: Buffer }[]
    ): Promise<void> {
        // In production, upload to cloud storage (S3, GCS, etc.)
        // For now, we'll process immediately in-memory
        logger.info('Files staged for processing', { jobId, fileCount: files.length });
    }
}

export const batchService = new BatchService();
