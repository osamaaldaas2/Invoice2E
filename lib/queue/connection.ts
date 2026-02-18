/**
 * BullMQ Redis Connection Factory
 *
 * Creates separate IORedis connections for queues and workers (BullMQ best practice).
 * Uses REDIS_URL env var for TCP-based Redis (separate from Upstash REST).
 *
 * @module lib/queue/connection
 */

import IORedis, { type RedisOptions } from 'ioredis';
import { logger } from '@/lib/logger';

/** Redis connection options shared across queue and worker connections. */
const BASE_OPTIONS: RedisOptions = {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
  retryStrategy(times: number): number | null {
    if (times > 10) {
      logger.error('Redis connection: max retries exceeded', { times });
      return null; // Stop retrying
    }
    // Exponential backoff: 200ms, 400ms, 800ms, … capped at 10s
    return Math.min(times * 200, 10_000);
  },
  reconnectOnError(err: Error): boolean {
    const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
    return targetErrors.some((e) => err.message.includes(e));
  },
};

/**
 * Resolve the Redis URL from environment variables.
 * Falls back to localhost for development.
 */
function getRedisUrl(): string {
  const url = process.env.BULLMQ_REDIS_URL ?? process.env.REDIS_URL;
  if (!url) {
    // FIX: Audit #020 — fail fast in production if Redis URL missing
    if (process.env.NODE_ENV === 'production') {
      throw new Error('BULLMQ_REDIS_URL or REDIS_URL must be set in production');
    }
    logger.warn('No BULLMQ_REDIS_URL or REDIS_URL set — using localhost:6379');
    return 'redis://localhost:6379';
  }
  return url;
}

/**
 * FIX: Audit #021 — validate Redis maxmemory-policy at startup.
 * BullMQ requires noeviction to prevent silent data loss.
 */
async function validateRedisConfig(connection: IORedis): Promise<void> {
  try {
    const config = await connection.config('GET', 'maxmemory-policy');
    const policy = Array.isArray(config) ? config[1] : undefined;
    if (policy && policy !== 'noeviction') {
      logger.error(
        `CRITICAL: Redis maxmemory-policy is '${policy}' — must be 'noeviction' for BullMQ. Data loss WILL occur.`,
        { policy, audit: '#021' }
      );
    }
  } catch (err) {
    logger.warn('Could not verify Redis maxmemory-policy', { error: String(err) });
  }
}

/** Singleton connections (lazy-initialized). */
let _queueConnection: IORedis | null = null;
let _workerConnection: IORedis | null = null;

/**
 * Get or create the shared Redis connection for **queues** (enqueue side).
 * BullMQ docs recommend separate connections for queue vs worker.
 */
export function getQueueConnection(): IORedis {
  if (!_queueConnection) {
    _queueConnection = new IORedis(getRedisUrl(), {
      ...BASE_OPTIONS,
      connectionName: 'invoice2e:queue',
    });
    _queueConnection.on('error', (err) => {
      logger.error('Redis queue connection error', { error: String(err) });
    });
    // FIX: Audit #021 — validate Redis config on first connection
    validateRedisConfig(_queueConnection).catch(() => {});
    logger.info('Redis queue connection created');
  }
  return _queueConnection;
}

/**
 * Get or create the shared Redis connection for **workers** (dequeue side).
 */
export function getWorkerConnection(): IORedis {
  if (!_workerConnection) {
    _workerConnection = new IORedis(getRedisUrl(), {
      ...BASE_OPTIONS,
      connectionName: 'invoice2e:worker',
    });
    _workerConnection.on('error', (err) => {
      logger.error('Redis worker connection error', { error: String(err) });
    });
    logger.info('Redis worker connection created');
  }
  return _workerConnection;
}

/**
 * Gracefully close all Redis connections.
 * Call during application shutdown.
 */
// FIX: Audit #019 — register graceful shutdown handlers
if (typeof process !== 'undefined' && typeof process.on === 'function') {
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal} — shutting down Redis connections gracefully`);
    await closeAllConnections();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM').then(() => process.exit(0)));
  process.on('SIGINT', () => shutdown('SIGINT').then(() => process.exit(0)));
}

export async function closeAllConnections(): Promise<void> {
  const promises: Promise<void>[] = [];
  if (_queueConnection) {
    promises.push(
      _queueConnection.quit().then(() => {
        _queueConnection = null;
      })
    );
  }
  if (_workerConnection) {
    promises.push(
      _workerConnection.quit().then(() => {
        _workerConnection = null;
      })
    );
  }
  await Promise.all(promises);
  logger.info('All Redis connections closed');
}
