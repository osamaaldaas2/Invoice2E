/**
 * GET /api/health/live — Liveness probe.
 *
 * Returns 200 if the process is alive. No dependency checks.
 * Used by orchestrators (k8s, Docker, etc.) to detect crashed processes.
 *
 * @module app/api/health/live/route
 */

import { NextResponse } from 'next/server';

interface LivenessResponse {
  status: 'alive';
  timestamp: string;
}

/**
 * GET /api/health/live — Simple liveness check.
 */
export function GET(): NextResponse<LivenessResponse> {
  return NextResponse.json(
    { status: 'alive', timestamp: new Date().toISOString() },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    },
  );
}
