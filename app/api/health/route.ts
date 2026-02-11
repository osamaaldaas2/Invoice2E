import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { APP_VERSION } from '@/lib/constants';
import { createServerClient } from '@/lib/supabase.server';
import { isUsingRedis } from '@/lib/rate-limiter';

interface HealthCheckResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  version: string;
  checks: {
    database: 'ok' | 'error';
    redis: 'ok' | 'not_configured' | 'error';
    ai: {
      deepseek: 'configured' | 'not_configured';
      gemini: 'configured' | 'not_configured';
    };
    uptime: number;
  };
}

const startTime = Date.now();

/**
 * GET /api/health — Liveness + readiness check
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const probe = url.searchParams.get('probe');

  // Liveness probe — just confirms the process is running
  if (probe === 'live') {
    return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
  }

  const checks = {
    database: 'error' as 'ok' | 'error',
    redis: 'not_configured' as 'ok' | 'not_configured' | 'error',
    ai: {
      deepseek: (process.env.DEEPSEEK_API_KEY ? 'configured' : 'not_configured') as
        | 'configured'
        | 'not_configured',
      gemini: (process.env.GEMINI_API_KEY ? 'configured' : 'not_configured') as
        | 'configured'
        | 'not_configured',
    },
  };

  try {
    // Database connectivity
    const supabase = createServerClient();
    const { error: dbError } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .limit(1);

    checks.database = dbError ? 'error' : 'ok';

    // Redis status
    checks.redis = isUsingRedis() ? 'ok' : 'not_configured';

    const allHealthy = checks.database === 'ok';

    const response: HealthCheckResponse = {
      status: allHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: APP_VERSION,
      checks: {
        ...checks,
        uptime: Math.floor((Date.now() - startTime) / 1000),
      },
    };

    logger.info('Health check completed', { status: response.status, checks });

    return NextResponse.json(response, {
      status: allHealthy ? 200 : 503,
    });
  } catch (error) {
    logger.error('Health check failed', error);
    const errorResponse: HealthCheckResponse = {
      status: 'error',
      timestamp: new Date().toISOString(),
      version: APP_VERSION,
      checks: {
        ...checks,
        uptime: Math.floor((Date.now() - startTime) / 1000),
      },
    };

    return NextResponse.json(errorResponse, { status: 500 });
  }
}
