/**
 * GET /api/health — Comprehensive health check endpoint.
 *
 * Reports overall status, component health, format engine versions,
 * memory usage, uptime, and app version. Never exposes secrets.
 *
 * @module app/api/health/route
 */

import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { APP_VERSION } from '@/lib/constants';
import { GeneratorFactory } from '@/services/format/GeneratorFactory';
import {
  checkDatabase,
  checkRedis,
  checkAIProviders,
  aggregateHealth,
  type HealthStatus,
  type ComponentHealth,
} from '@/lib/health-check';

/** Timestamp (ms) when the module was first loaded — used to calculate uptime. */
const START_TIME = Date.now();

/** No-cache headers applied to all health responses. */
const HEALTH_HEADERS = {
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
} as const;

interface HealthResponse {
  status: HealthStatus;
  timestamp: string;
  version: string;
  uptimeSeconds: number;
  memory: {
    heapUsedMB: number;
    heapTotalMB: number;
    rssMB: number;
    externalMB: number;
  };
  components: {
    database: ComponentHealth;
    redis: ComponentHealth;
    ai: Record<string, ComponentHealth>;
  };
  formatEngines: Array<{
    formatId: string;
    formatName: string;
    version: string;
    specVersion: string;
    specDate: string;
    deprecated: boolean;
  }>;
}

/**
 * GET /api/health — Detailed health check.
 */
export async function GET(): Promise<NextResponse<HealthResponse>> {
  try {
    const [database, redis] = await Promise.allSettled([
      checkDatabase(),
      checkRedis(),
    ]);

    const dbHealth: ComponentHealth =
      database.status === 'fulfilled'
        ? database.value
        : { status: 'down', message: database.reason?.message ?? 'Check failed' };

    const redisHealth: ComponentHealth =
      redis.status === 'fulfilled'
        ? redis.value
        : { status: 'down', message: redis.reason?.message ?? 'Check failed' };

    const ai = checkAIProviders();

    const components = { database: dbHealth, redis: redisHealth, ai };
    const status = aggregateHealth(components);

    let formatEngines: HealthResponse['formatEngines'] = [];
    try {
      formatEngines = GeneratorFactory.getEngineVersions();
    } catch {
      logger.warn('Health: failed to retrieve format engine versions');
    }

    const mem = process.memoryUsage();
    const toMB = (bytes: number): number => Math.round((bytes / 1024 / 1024) * 100) / 100;

    const response: HealthResponse = {
      status,
      timestamp: new Date().toISOString(),
      version: APP_VERSION,
      uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
      memory: {
        heapUsedMB: toMB(mem.heapUsed),
        heapTotalMB: toMB(mem.heapTotal),
        rssMB: toMB(mem.rss),
        externalMB: toMB(mem.external),
      },
      components,
      formatEngines,
    };

    logger.info('Health check completed', { status });

    const httpStatus = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503;
    return NextResponse.json(response, { status: httpStatus, headers: HEALTH_HEADERS });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Health check failed', { error: message });

    const mem = process.memoryUsage();
    const toMB = (bytes: number): number => Math.round((bytes / 1024 / 1024) * 100) / 100;

    const errorResponse: HealthResponse = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      version: APP_VERSION,
      uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
      memory: {
        heapUsedMB: toMB(mem.heapUsed),
        heapTotalMB: toMB(mem.heapTotal),
        rssMB: toMB(mem.rss),
        externalMB: toMB(mem.external),
      },
      components: {
        database: { status: 'down', message: 'Check could not run' },
        redis: { status: 'down', message: 'Check could not run' },
        ai: {},
      },
      formatEngines: [],
    };

    return NextResponse.json(errorResponse, { status: 500, headers: HEALTH_HEADERS });
  }
}
