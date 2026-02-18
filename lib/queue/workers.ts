/**
 * BullMQ Worker Registration Factory
 *
 * Creates workers with per-queue concurrency, stalled job detection,
 * and graceful shutdown handling.
 *
 * @module lib/queue/workers
 */

import { Worker, type Processor, type WorkerOptions } from 'bullmq';
import { getWorkerConnection } from './connection';
import { QUEUE_NAMES, type QueueName } from './types';
import { logger } from '@/lib/logger';

/** Default concurrency per queue. */
const CONCURRENCY: Record<QueueName, number> = {
  [QUEUE_NAMES.EXTRACTION]: 3,
  [QUEUE_NAMES.CONVERSION]: 5,
  [QUEUE_NAMES.BATCH]: 2,
  [QUEUE_NAMES.EMAIL]: 10,
};

/** Active workers tracked for graceful shutdown. */
const activeWorkers: Worker[] = [];

/**
 * Create and register a BullMQ Worker for a specific queue.
 *
 * @param queueName - Queue to consume from
 * @param processor - Job processor function
 * @param opts - Additional worker options
 * @returns The created Worker instance
 */
export function createWorker<TData = unknown, TResult = unknown>(
  queueName: QueueName,
  processor: Processor<TData, TResult>,
  opts?: Partial<WorkerOptions>
): Worker<TData, TResult> {
  const worker = new Worker<TData, TResult>(queueName, processor, {
    connection: getWorkerConnection() as any,
    concurrency: CONCURRENCY[queueName] ?? 3,
    stalledInterval: 30_000, // Check for stalled jobs every 30s
    maxStalledCount: 2, // Allow 2 stalls before marking failed
    lockDuration: 60_000, // Job lock duration: 60s
    ...opts,
  });

  worker.on('completed', (job) => {
    logger.info('Job completed', { queue: queueName, jobId: job?.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('Job failed', {
      queue: queueName,
      jobId: job?.id,
      error: err.message,
      attemptsMade: job?.attemptsMade,
    });
  });

  worker.on('stalled', (jobId) => {
    logger.warn('Job stalled', { queue: queueName, jobId });
  });

  worker.on('error', (err) => {
    logger.error('Worker error', { queue: queueName, error: err.message });
  });

  activeWorkers.push(worker);
  logger.info('Worker registered', { queue: queueName, concurrency: CONCURRENCY[queueName] });

  return worker;
}

/**
 * Gracefully shut down all registered workers.
 * Waits for active jobs to complete before closing.
 */
export async function shutdownAllWorkers(): Promise<void> {
  logger.info('Shutting down all workers', { count: activeWorkers.length });
  await Promise.all(activeWorkers.map((w) => w.close()));
  activeWorkers.length = 0;
  logger.info('All workers shut down');
}
