/**
 * BullMQ Queue Definitions
 *
 * Named queues with default job options (3 attempts, exponential backoff).
 * All queues share the queue-side Redis connection.
 *
 * @module lib/queue/queues
 */

import { Queue } from 'bullmq';
import type { DefaultJobOptions } from 'bullmq';
import { getQueueConnection } from './connection';
import { QUEUE_NAMES, type QueueName } from './types';

/** Default job options applied to every job unless overridden. */
const DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2_000, // 2s → 4s → 8s
  },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600, count: 5000 },
};

/** Cache of instantiated queues keyed by queue name. */
const queueCache = new Map<string, Queue>();

/**
 * Get or create a BullMQ Queue by name.
 *
 * @param name - One of the QUEUE_NAMES constants
 * @param jobOptions - Override default job options
 */
export function getQueue(name: QueueName, jobOptions?: DefaultJobOptions): Queue {
  const existing = queueCache.get(name);
  if (existing) return existing;

  const queue = new Queue(name, {
    connection: getQueueConnection() as any,
    defaultJobOptions: { ...DEFAULT_JOB_OPTIONS, ...jobOptions },
  });

  queueCache.set(name, queue);
  return queue;
}

// ─── Convenience Accessors ──────────────────────────────────────────────────

/** Queue for invoice extraction jobs. */
export function getExtractionQueue(): Queue {
  return getQueue(QUEUE_NAMES.EXTRACTION);
}

/** Queue for invoice conversion jobs. */
export function getConversionQueue(): Queue {
  return getQueue(QUEUE_NAMES.CONVERSION);
}

/** Queue for batch processing jobs. */
export function getBatchQueue(): Queue {
  return getQueue(QUEUE_NAMES.BATCH);
}

/** Queue for email delivery jobs. */
export function getEmailQueue(): Queue {
  return getQueue(QUEUE_NAMES.EMAIL);
}

/**
 * Close all queues. Call during application shutdown.
 */
export async function closeAllQueues(): Promise<void> {
  const promises = Array.from(queueCache.values()).map((q) => q.close());
  await Promise.all(promises);
  queueCache.clear();
}
