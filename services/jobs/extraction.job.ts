/**
 * Extraction Job Processor
 *
 * Downloads a file, extracts invoice data with AI, and saves the result.
 * Designed for dependency injection and independent testability.
 *
 * @module services/jobs/extraction.job
 */

import type { Job } from 'bullmq';
import {
  ExtractionJobPayloadSchema,
  type ExtractionJobPayload,
  type ExtractionJobResult,
} from '@/lib/queue/types';
import { logger } from '@/lib/logger';

/** Dependencies injected for testability. */
export interface ExtractionDeps {
  /** Download file content by fileId. Returns raw buffer/blob. */
  downloadFile: (fileId: string, userId: string) => Promise<Buffer>;
  /** Run AI extraction on file content. */
  extractWithAI: (
    fileBuffer: Buffer,
    options?: ExtractionJobPayload['options']
  ) => Promise<{ extractionData: Record<string, unknown>; confidenceScore: number | null }>;
  /** Persist extraction result and return the new extraction ID. */
  saveExtraction: (params: {
    userId: string;
    extractionData: Record<string, unknown>;
    confidenceScore: number | null;
    processingTimeMs: number;
    status: string;
  }) => Promise<string>;
}

/**
 * Create the extraction job processor with injected dependencies.
 *
 * @param deps - Service dependencies
 * @returns BullMQ-compatible processor function
 */
export function createExtractionProcessor(deps: ExtractionDeps) {
  return async (job: Job<ExtractionJobPayload, ExtractionJobResult>): Promise<ExtractionJobResult> => {
    const startTime = Date.now();

    // Validate payload
    const parsed = ExtractionJobPayloadSchema.safeParse(job.data);
    if (!parsed.success) {
      throw new Error(`Invalid extraction job payload: ${parsed.error.message}`);
    }
    const { fileId, userId, options } = parsed.data;

    logger.info('Extraction job started', { jobId: job.id, fileId, userId });

    // Step 1: Download file (20% progress)
    await job.updateProgress(10);
    const fileBuffer = await deps.downloadFile(fileId, userId);
    await job.updateProgress(20);

    logger.info('File downloaded for extraction', { jobId: job.id, fileId, size: fileBuffer.length });

    // Step 2: AI extraction (20% → 80%)
    await job.updateProgress(30);
    const { extractionData, confidenceScore } = await deps.extractWithAI(fileBuffer, options);
    await job.updateProgress(80);

    // Step 3: Save result (80% → 100%)
    const processingTimeMs = Date.now() - startTime;
    const extractionId = await deps.saveExtraction({
      userId,
      extractionData,
      confidenceScore,
      processingTimeMs,
      status: 'completed',
    });
    await job.updateProgress(100);

    logger.info('Extraction job completed', {
      jobId: job.id,
      extractionId,
      confidenceScore,
      processingTimeMs,
    });

    return { extractionId, confidenceScore, processingTimeMs };
  };
}
