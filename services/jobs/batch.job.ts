/**
 * Batch Job Processor
 *
 * Orchestrates batch invoice processing using BullMQ FlowProducer
 * to create parent-child job relationships. Each file spawns a
 * child extraction job; the batch job tracks overall progress.
 *
 * @module services/jobs/batch.job
 */

import { FlowProducer, type Job } from 'bullmq';
import {
  BatchJobPayloadSchema,
  QUEUE_NAMES,
  type BatchJobPayload,
  type BatchJobResult,
  type ExtractionJobPayload,
} from '@/lib/queue/types';
import { getQueueConnection } from '@/lib/queue/connection';
import { logger } from '@/lib/logger';

/** Dependencies injected for testability. */
export interface BatchDeps {
  /** Update batch status in the database. */
  updateBatchStatus: (params: {
    batchId: string;
    status: string;
    successCount: number;
    failureCount: number;
    extractionIds: string[];
    processingTimeMs: number;
  }) => Promise<void>;
}

/**
 * Create the batch job processor with injected dependencies.
 *
 * @param deps - Service dependencies
 * @returns BullMQ-compatible processor function
 */
export function createBatchProcessor(deps: BatchDeps) {
  return async (job: Job<BatchJobPayload, BatchJobResult>): Promise<BatchJobResult> => {
    const startTime = Date.now();

    // Validate payload
    const parsed = BatchJobPayloadSchema.safeParse(job.data);
    if (!parsed.success) {
      throw new Error(`Invalid batch job payload: ${parsed.error.message}`);
    }
    const { batchId, userId, fileIds, options } = parsed.data;

    logger.info('Batch job started', { jobId: job.id, batchId, fileCount: fileIds.length });
    await job.updateProgress(5);

    // Create child extraction jobs via FlowProducer
    const flowProducer = new FlowProducer({ connection: getQueueConnection() });

    const childJobs = fileIds.map((fileId, index) => ({
      name: `extract:${batchId}:${index}`,
      queueName: QUEUE_NAMES.EXTRACTION,
      data: {
        fileId,
        userId,
        options: {
          language: options?.language,
          ocrEnabled: options?.ocrEnabled,
          outputFormat: options?.outputFormat,
        },
      } satisfies ExtractionJobPayload,
    }));

    const flow = await flowProducer.add({
      name: `batch:${batchId}`,
      queueName: QUEUE_NAMES.BATCH,
      data: job.data,
      children: childJobs,
    });

    logger.info('Batch flow created', {
      jobId: job.id,
      batchId,
      flowJobId: flow.job.id,
      childCount: childJobs.length,
    });

    await job.updateProgress(20);

    // Wait for children to complete (BullMQ handles this via the flow)
    // The parent job will remain active until all children finish.
    const childResults = await job.getChildrenValues<{ extractionId: string }>();

    // Tally results
    const extractionIds: string[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const [, result] of Object.entries(childResults)) {
      if (result?.extractionId) {
        extractionIds.push(result.extractionId);
        successCount++;
      } else {
        failureCount++;
      }
    }

    // Jobs that didn't produce a result are failures
    failureCount += fileIds.length - successCount - failureCount;

    const processingTimeMs = Date.now() - startTime;

    // Persist batch status
    await deps.updateBatchStatus({
      batchId,
      status: failureCount === 0 ? 'completed' : 'completed_with_errors',
      successCount,
      failureCount,
      extractionIds,
      processingTimeMs,
    });

    await job.updateProgress(100);

    logger.info('Batch job completed', {
      jobId: job.id,
      batchId,
      successCount,
      failureCount,
      processingTimeMs,
    });

    await flowProducer.close();

    return {
      batchId,
      totalFiles: fileIds.length,
      successCount,
      failureCount,
      extractionIds,
      processingTimeMs,
    };
  };
}
