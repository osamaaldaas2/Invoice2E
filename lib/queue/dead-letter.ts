/**
 * Dead Letter Queue (DLQ) Handler
 *
 * Logs failed jobs with full context and provides optional retry-from-DLQ.
 *
 * @module lib/queue/dead-letter
 */

import type { Job, Queue } from 'bullmq';
import { logger } from '@/lib/logger';
import type { DeadLetterEntry, QueueName } from './types';

/**
 * Handle a permanently failed job by logging it as a dead letter entry.
 * Called from worker `failed` event when attemptsMade >= max attempts.
 *
 * @param job - The failed BullMQ job
 * @param queueName - Name of the originating queue
 * @param error - The error that caused the final failure
 */
export function handleDeadLetter(job: Job, queueName: QueueName, error: Error): void {
  const entry: DeadLetterEntry = {
    jobId: job.id ?? 'unknown',
    queueName,
    payload: job.data,
    failedReason: error.message,
    attemptsMade: job.attemptsMade,
    failedAt: new Date().toISOString(),
    stackTrace: job.stacktrace,
  };

  logger.error('Job moved to dead letter queue', {
    ...entry,
    // Omit large payload from top-level log to avoid noise
    payload: undefined,
  });

  // In a production system, this could persist to a DB table or a dedicated DLQ queue.
  // For now, structured logging ensures observability via log aggregation.
}

/**
 * Retry a failed job from the DLQ by re-adding it to the original queue.
 *
 * @param queue - The BullMQ Queue instance to re-enqueue into
 * @param jobData - The original job payload
 * @param originalJobId - The original job ID (for tracing)
 * @returns The new job ID
 */
export async function retryFromDeadLetter(
  queue: Queue,
  jobData: unknown,
  originalJobId: string
): Promise<string> {
  const job = await queue.add(`dlq-retry:${originalJobId}`, jobData, {
    attempts: 1, // Single retry attempt from DLQ
  });

  logger.info('Job retried from dead letter queue', {
    originalJobId,
    newJobId: job.id,
    queueName: queue.name,
  });

  return job.id ?? 'unknown';
}
