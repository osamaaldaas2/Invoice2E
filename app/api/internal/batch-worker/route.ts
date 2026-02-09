import { NextRequest, NextResponse } from 'next/server';
import { batchService } from '@/services/batch.service';
import { handleApiError } from '@/lib/api-helpers';
import { logger } from '@/lib/logger';

export const maxDuration = 120;

function isWorkerAuthorized(request: NextRequest): boolean {
    const configuredSecret = process.env.BATCH_WORKER_SECRET;
    const provided = request.headers.get('x-internal-worker-key');

    if (configuredSecret) {
        return provided === configuredSecret;
    }

    // In production, require the secret — never fall back to open access
    if (process.env.NODE_ENV === 'production') {
        logger.error('BATCH_WORKER_SECRET is not configured in production — rejecting all worker requests');
        return false;
    }

    // Development fallback
    return true;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        if (!isWorkerAuthorized(request)) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized worker request' },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(request.url);
        const maxJobsParam = Number(searchParams.get('maxJobs') || '3');
        const maxJobs = Number.isFinite(maxJobsParam) && maxJobsParam > 0
            ? Math.min(maxJobsParam, 20)
            : 3;

        let processed = 0;
        for (let i = 0; i < maxJobs; i++) {
            const handled = await batchService.runWorkerOnce();
            if (!handled) break;
            processed++;
        }

        logger.info('Internal batch worker run complete', { processed, maxJobs });
        return NextResponse.json({
            success: true,
            processed,
            maxJobs,
        });
    } catch (error) {
        return handleApiError(error, 'Internal batch worker error', {
            includeSuccess: true,
            message: 'Batch worker failed',
        });
    }
}

export async function OPTIONS(): Promise<NextResponse> {
    return NextResponse.json({}, { status: 200 });
}
