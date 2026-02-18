/**
 * BullMQ Worker Registration Factory
 *
 * Creates workers with per-queue concurrency, stalled job detection,
 * graceful shutdown handling, and dead letter routing.
 *
 * STATUS: Scaffolded but intentionally inactive in Vercel deployment.
 *
 * ARCHITECTURE DECISION (Re-audit #10, 2026-02):
 * Vercel serverless functions cannot run long-lived BullMQ workers.
 * Batch processing currently uses HTTP self-invocation via
 * /api/internal/batch-worker as a serverless-compatible alternative.
 *
 * The BullMQ queue infrastructure (queues, workers, dead letter handling,
 * graceful shutdown) is maintained for:
 * 1. Future migration to a dedicated worker process (Docker/VM)
 * 2. Local development with a real Redis instance
 * 3. Self-hosted deployments that support long-lived processes
 *
 * TO ACTIVATE:
 * 1. Deploy a long-lived worker process (not serverless)
 * 2. Call createWorker() for each queue in the worker process entry point
 * 3. Configure BULLMQ_REDIS_URL to point to a Redis instance with noeviction policy
 * 4. Graceful shutdown handlers auto-register on first createWorker() call
 * 5. Dead letter handler auto-wires to worker failed events
 * 6. Monitor dead letter entries via structured logging
 *
 * Related: Re-audit findings #8, #9, #10
 *
 * @see services/batch/batch.processor.ts — current HTTP-based processing
 * @see app/api/internal/batch-worker/route.ts — serverless batch trigger
 * @module lib/queue/workers
 */

import { Worker, type Processor, type WorkerOptions } from 'bullmq';
import { getWorkerConnection, closeAllConnections } from './connection';
import { QUEUE_NAMES, type QueueName } from './types';
import { handleDeadLetter } from './dead-letter';
import { logger } from '@/lib/logger';

/** FIX: Re-audit #8 — graceful shutdown timeout for in-flight jobs. */
const SHUTDOWN_TIMEOUT_MS = 10_000;

/** Default concurrency per queue. */
const CONCURRENCY: Record<QueueName, number> = {
  [QUEUE_NAMES.EXTRACTION]: 3,
  [QUEUE_NAMES.CONVERSION]: 5,
  [QUEUE_NAMES.BATCH]: 2,
  [QUEUE_NAMES.EMAIL]: 10,
};

/** Active workers tracked for graceful shutdown. */
const activeWorkers: Worker[] = [];

// ── Graceful Shutdown (FIX: Re-audit #8) ──────────────────────────────

/** Whether the signal handlers have been registered. */
let _shutdownRegistered = false;

/**
 * FIX: Re-audit #8 — register SIGTERM/SIGINT handlers that gracefully
 * shut down all BullMQ workers before closing Redis connections.
 *
 * Idempotent: calling multiple times only registers once.
 * Called automatically on first `createWorker()` invocation so the
 * handler is active whenever workers exist.
 *
 * Shutdown sequence:
 * 1. Wait for in-flight jobs to complete (up to SHUTDOWN_TIMEOUT_MS)
 * 2. Close Redis connections
 * 3. Exit process
 */
export function registerGracefulShutdown(): void {
  if (_shutdownRegistered) return;
  if (typeof process === 'undefined' || typeof process.on !== 'function') return;
  _shutdownRegistered = true;

  const shutdown = async (signal: string) => {
    logger.info({
      msg: `Received ${signal} — shutting down workers gracefully`,
      workerCount: activeWorkers.length,
      audit: 'Re-audit #8',
    });

    try {
      // Give workers time to complete in-flight jobs
      await Promise.race([
        shutdownAllWorkers(),
        new Promise<void>((resolve) => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS)),
      ]);
      logger.info('Workers shut down successfully');
    } catch (error) {
      logger.error('Error during worker shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      await closeAllConnections();
    } catch (connErr) {
      logger.error('Error closing Redis connections during shutdown', {
        error: connErr instanceof Error ? connErr.message : String(connErr),
      });
    }

    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

/** Exposed for testing — returns whether shutdown handlers have been registered. */
export function _isShutdownRegistered(): boolean {
  return _shutdownRegistered;
}

/** Exposed for testing — reset the registration flag. */
export function _resetShutdownRegistered(): void {
  _shutdownRegistered = false;
}

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
  // FIX: Re-audit #8 — register shutdown handler on first worker creation
  registerGracefulShutdown();
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

    // FIX: Re-audit #9 — route permanently failed jobs to dead letter handler
    if (job && job.attemptsMade >= (job.opts?.attempts ?? 1)) {
      handleDeadLetter(job, queueName, err);
    }
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
