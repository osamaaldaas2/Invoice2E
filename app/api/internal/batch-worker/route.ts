import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { batchService } from '@/services/batch.service';
import { handleApiError } from '@/lib/api-helpers';
import { logger } from '@/lib/logger';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';

export const maxDuration = 300; // 5 min — handles up to ~100 invoices at concurrency 5

function safeCompare(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isWorkerAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (request.method === 'GET') {
    return (
      !!cronSecret &&
      safeCompare(request.headers.get('authorization') || '', `Bearer ${cronSecret}`)
    );
  }
  const configuredSecret = process.env.BATCH_WORKER_SECRET;

  if (!configuredSecret) {
    logger.error('BATCH_WORKER_SECRET is not configured — rejecting all worker requests');
    return false;
  }

  const provided = request.headers.get('x-internal-worker-key');
  if (!provided) return false;
  return safeCompare(provided, configuredSecret);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // H10 fix: Rate limit BEFORE auth to prevent brute-force on worker secret
    const rateLimitId = `worker:${getRequestIdentifier(request)}`;
    const rateLimit = await checkRateLimitAsync(rateLimitId, 'worker');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many worker requests' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.resetInSeconds) } }
      );
    }

    if (!isWorkerAuthorized(request)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized worker request' },
        { status: 401 }
      );
    }

    // EXP-1 fix: Recover jobs stuck in 'processing' before picking new ones
    await batchService.recoverStuckJobs();

    const { searchParams } = new URL(request.url);
    const maxJobsParam = Number(searchParams.get('maxJobs') || '1');
    const maxJobs =
      Number.isFinite(maxJobsParam) && maxJobsParam > 0 ? Math.min(maxJobsParam, 1) : 1;

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

export const GET = POST;

export async function OPTIONS(): Promise<NextResponse> {
  return NextResponse.json({}, { status: 200 });
}
