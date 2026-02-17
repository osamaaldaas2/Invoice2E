/**
 * Conversion Job Processor
 *
 * Loads an extraction result, generates the target e-invoice format, and saves it.
 * Designed for dependency injection and independent testability.
 *
 * @module services/jobs/conversion.job
 */

import type { Job } from 'bullmq';
import {
  ConversionJobPayloadSchema,
  type ConversionJobPayload,
  type ConversionJobResult,
} from '@/lib/queue/types';
import { logger } from '@/lib/logger';

/** Dependencies injected for testability. */
export interface ConversionDeps {
  /** Load extraction data by ID. */
  loadExtraction: (extractionId: string, userId: string) => Promise<{
    extractionData: Record<string, unknown>;
  }>;
  /** Generate the output format from extraction data. */
  generateFormat: (
    extractionData: Record<string, unknown>,
    outputFormat: string
  ) => Promise<{ output: string; validationStatus: string }>;
  /** Persist the conversion result and return the conversion ID. */
  saveConversion: (params: {
    userId: string;
    extractionId: string;
    outputFormat: string;
    validationStatus: string;
    processingTimeMs: number;
    status: string;
  }) => Promise<string>;
}

/**
 * Create the conversion job processor with injected dependencies.
 *
 * @param deps - Service dependencies
 * @returns BullMQ-compatible processor function
 */
export function createConversionProcessor(deps: ConversionDeps) {
  return async (job: Job<ConversionJobPayload, ConversionJobResult>): Promise<ConversionJobResult> => {
    const startTime = Date.now();

    // Validate payload
    const parsed = ConversionJobPayloadSchema.safeParse(job.data);
    if (!parsed.success) {
      throw new Error(`Invalid conversion job payload: ${parsed.error.message}`);
    }
    const { extractionId, userId, outputFormat } = parsed.data;

    logger.info('Conversion job started', { jobId: job.id, extractionId, outputFormat });

    // Step 1: Load extraction (20%)
    await job.updateProgress(10);
    const { extractionData } = await deps.loadExtraction(extractionId, userId);
    await job.updateProgress(20);

    // Step 2: Generate format (20% → 80%)
    await job.updateProgress(30);
    const { validationStatus } = await deps.generateFormat(extractionData, outputFormat);
    await job.updateProgress(80);

    // Step 3: Save conversion (80% → 100%)
    const processingTimeMs = Date.now() - startTime;
    const conversionId = await deps.saveConversion({
      userId,
      extractionId,
      outputFormat,
      validationStatus,
      processingTimeMs,
      status: 'completed',
    });
    await job.updateProgress(100);

    logger.info('Conversion job completed', {
      jobId: job.id,
      conversionId,
      format: outputFormat,
      processingTimeMs,
    });

    return { conversionId, format: outputFormat, validationStatus, processingTimeMs };
  };
}
