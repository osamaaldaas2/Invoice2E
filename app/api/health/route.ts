import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { APP_VERSION } from '@/lib/constants';
import { createServerClient } from '@/lib/supabase.server';

interface HealthCheckResponse {
    status: 'ok' | 'degraded' | 'error';
    timestamp: string;
    version: string;
    checks?: {
        database: 'ok' | 'error';
        uptime: number;
    };
}

const startTime = Date.now();

export async function GET(): Promise<NextResponse> {
    const checks = {
        database: 'error' as 'ok' | 'error',
    };

    try {
        // Check database connectivity
        const supabase = createServerClient();
        const { error: dbError } = await supabase
            .from('users')
            .select('id', { count: 'exact', head: true })
            .limit(1);

        checks.database = dbError ? 'error' : 'ok';

        const allHealthy = checks.database === 'ok';

        const response: HealthCheckResponse = {
            status: allHealthy ? 'ok' : 'degraded',
            timestamp: new Date().toISOString(),
            version: APP_VERSION,
            checks: {
                database: checks.database,
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
                database: 'error',
                uptime: Math.floor((Date.now() - startTime) / 1000),
            },
        };

        return NextResponse.json(errorResponse, { status: 500 });
    }
}
