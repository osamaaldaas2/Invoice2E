/**
 * GET /api/health/ready — Readiness probe.
 *
 * Returns 200 when the app can serve traffic (database connected).
 * Returns 503 when critical dependencies are unavailable.
 * Used by load balancers to decide whether to route traffic to this instance.
 *
 * @module app/api/health/ready/route
 */

import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { checkDatabase, type ComponentHealth } from '@/lib/health-check';

interface ReadinessResponse {
  ready: boolean;
  timestamp: string;
  database: ComponentHealth;
}

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
} as const;

/**
 * GET /api/health/ready — Readiness check (database connectivity required).
 */
export async function GET(): Promise<NextResponse<ReadinessResponse>> {
  try {
    const database = await checkDatabase();
    const ready = database.status === 'up';

    if (!ready) {
      logger.warn('Readiness probe: database not available', { database });
    }

    return NextResponse.json(
      { ready, timestamp: new Date().toISOString(), database },
      { status: ready ? 200 : 503, headers: NO_CACHE_HEADERS },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Readiness probe failed', { error: message });

    return NextResponse.json(
      {
        ready: false,
        timestamp: new Date().toISOString(),
        database: { status: 'down' as const, message: 'Check could not run' },
      },
      { status: 503, headers: NO_CACHE_HEADERS },
    );
  }
}
