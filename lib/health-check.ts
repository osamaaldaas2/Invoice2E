/**
 * Health check utilities for monitoring service dependencies.
 * Reports component status without exposing secrets.
 *
 * @module lib/health-check
 */

import { createAdminClient } from '@/lib/supabase.server';
import { isUsingRedis } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/** Overall health status of the application. */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/** Health report for an individual component. */
export interface ComponentHealth {
  status: 'up' | 'down' | 'not_configured';
  latencyMs?: number;
  message?: string;
}

/** Default timeout for individual health checks (ms). */
const CHECK_TIMEOUT_MS = 5000;

/**
 * Race a promise against a timeout.
 * @param promise - The check to run.
 * @param timeoutMs - Maximum wait time.
 * @returns The promise result or a timeout error.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number = CHECK_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Health check timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Check database (Supabase) connectivity by running a lightweight query.
 * Never exposes connection strings or credentials.
 */
export async function checkDatabase(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    const supabase = createAdminClient();
    const { error } = await withTimeout(
      supabase.from('users').select('id', { count: 'exact', head: true }).limit(1)
    );
    const latencyMs = Date.now() - start;
    if (error) {
      logger.warn('Health: database check failed', { error: error.message });
      return { status: 'down', latencyMs, message: 'Query failed' };
    }
    return { status: 'up', latencyMs };
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Health: database check error', { error: message });
    return { status: 'down', latencyMs, message };
  }
}

/**
 * Check Redis / Upstash connectivity.
 * Uses the rate-limiter module's own detection — no separate connection needed.
 */
export async function checkRedis(): Promise<ComponentHealth> {
  try {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      return { status: 'not_configured', message: 'Upstash credentials not set' };
    }
    const using = isUsingRedis();
    return using
      ? { status: 'up' }
      : { status: 'down', message: 'Redis configured but client failed to initialise' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { status: 'down', message };
  }
}

/**
 * Check AI provider availability by verifying required env vars exist.
 * Never calls the actual API — config check only.
 */
export function checkAIProviders(): Record<string, ComponentHealth> {
  return {
    gemini: process.env.GEMINI_API_KEY
      ? { status: 'up' }
      : { status: 'not_configured', message: 'GEMINI_API_KEY not set' },
    openai: process.env.OPENAI_API_KEY
      ? { status: 'up' }
      : { status: 'not_configured', message: 'OPENAI_API_KEY not set' },
    mistral: process.env.MISTRAL_API_KEY
      ? { status: 'up' }
      : { status: 'not_configured', message: 'MISTRAL_API_KEY not set' },
  };
}

/**
 * Aggregate individual component checks into an overall health status.
 *
 * - **healthy**: all critical components (database) are up.
 * - **degraded**: database is up but optional components (Redis, some AI) are down.
 * - **unhealthy**: database is down.
 */
export function aggregateHealth(components: {
  database: ComponentHealth;
  redis: ComponentHealth;
  ai: Record<string, ComponentHealth>;
}): HealthStatus {
  if (components.database.status === 'down') {
    return 'unhealthy';
  }

  const redisDown = components.redis.status === 'down';
  const allAIDown = Object.values(components.ai).every((c) => c.status !== 'up');

  if (redisDown || allAIDown) {
    return 'degraded';
  }

  return 'healthy';
}
