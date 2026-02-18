/**
 * Job Status API Endpoint
 *
 * GET /api/jobs/:jobId?queue=<queueName>
 * Returns job status, progress, result, or error.
 *
 * @module app/api/jobs/[jobId]/route
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getQueue } from '@/lib/queue/queues';
import { QUEUE_NAMES, type QueueName, type JobStatusResponse } from '@/lib/queue/types';
import { logger } from '@/lib/logger';

const QuerySchema = z.object({
  queue: z.enum([
    QUEUE_NAMES.EXTRACTION,
    QUEUE_NAMES.CONVERSION,
    QUEUE_NAMES.BATCH,
    QUEUE_NAMES.EMAIL,
  ]),
});

/**
 * GET handler — retrieve job status by ID and queue name.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
): Promise<NextResponse> {
  const { jobId } = await params;

  const queueParam = request.nextUrl.searchParams.get('queue');
  const parsed = QuerySchema.safeParse({ queue: queueParam });
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Missing or invalid "queue" query parameter' },
      { status: 400 }
    );
  }

  const queueName = parsed.data.queue as QueueName;

  try {
    const queue = getQueue(queueName);
    const job = await queue.getJob(jobId);

    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    const state = await job.getState();

    const response: JobStatusResponse = {
      jobId: job.id ?? jobId,
      queueName,
      status: (state as string) === 'wait' || state === 'waiting' ? 'waiting' : (state as JobStatusResponse['status']),
      progress: typeof job.progress === 'number' ? job.progress : 0,
      result: state === 'completed' ? job.returnvalue : undefined,
      failedReason: state === 'failed' ? job.failedReason : undefined,
      attemptsMade: job.attemptsMade,
      createdAt: job.timestamp,
      finishedAt: job.finishedOn,
    };

    return NextResponse.json({ success: true, data: response });
  } catch (error) {
    logger.error('Failed to fetch job status', { jobId, queueName, error: String(error) });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
