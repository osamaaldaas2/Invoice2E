import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { APP_VERSION } from '@/lib/constants';
import type { HealthCheckResponse } from '@/types/api.types';

export async function GET(): Promise<NextResponse<HealthCheckResponse>> {
    try {
        logger.info('Health check requested');

        const response: HealthCheckResponse = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            version: APP_VERSION,
        };

        return NextResponse.json(response);
    } catch (error) {
        logger.error('Health check failed', error);

        const errorResponse: HealthCheckResponse = {
            status: 'error',
            timestamp: new Date().toISOString(),
            version: APP_VERSION,
        };

        return NextResponse.json(errorResponse, { status: 500 });
    }
}
