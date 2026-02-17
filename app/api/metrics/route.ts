/**
 * GET /api/metrics — Prometheus metrics endpoint.
 *
 * Returns all registered metrics in Prometheus text exposition format.
 * Intended for scraping by Prometheus or compatible collectors.
 *
 * @module app/api/metrics/route
 */

import { NextRequest, NextResponse } from 'next/server';
import { register } from '@/lib/metrics';
import { logger } from '@/lib/logger';
import { getSessionFromCookie } from '@/lib/session';

/** No-cache headers for metrics responses. */
const METRICS_HEADERS = {
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
} as const;

/**
 * FIX: Audit #007 — authenticate metrics endpoint.
 * Accepts either a valid session (admin/super_admin) or a dedicated METRICS_AUTH_TOKEN.
 */
function verifyMetricsAuth(request: NextRequest): boolean {
  // Option 1: Bearer token for external scrapers (Prometheus/Grafana)
  const token = process.env.METRICS_AUTH_TOKEN;
  if (token) {
    const authHeader = request.headers.get('authorization');
    if (authHeader === `Bearer ${token}`) {
      return true;
    }
  }

  return false;
}

/**
 * GET /api/metrics — Expose Prometheus metrics as text/plain.
 * FIX: Audit #007 — requires authentication (session or bearer token).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // FIX: Audit #007 — authenticate metrics endpoint
  const hasToken = verifyMetricsAuth(request);
  if (!hasToken) {
    // Fall back to session-based auth (admin only)
    const session = await getSessionFromCookie();
    if (!session || !['admin', 'super_admin'].includes(session.role)) {
      logger.warn('Unauthenticated metrics access attempt');
      return new NextResponse('Unauthorized', { status: 401, headers: METRICS_HEADERS });
    }
  }
  try {
    const metrics = await register.metrics();
    return new NextResponse(metrics, {
      status: 200,
      headers: {
        'Content-Type': register.contentType,
        ...METRICS_HEADERS,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to collect metrics', { error: message });
    return new NextResponse('Internal Server Error', {
      status: 500,
      headers: METRICS_HEADERS,
    });
  }
}
