/**
 * Bulk Upload API Route
 * Handles batch invoice processing
 *
 * @route /api/invoices/bulk-upload
 */

import { NextRequest, NextResponse } from 'next/server';
import { batchService } from '@/services/batch.service';
import { createUserScopedClient } from '@/lib/supabase.server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { getAuthenticatedUser } from '@/lib/auth';
import { createSignedDownloadToken } from '@/lib/session';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';
import { FILE_LIMITS } from '@/lib/constants';
import { PaginationSchema } from '@/lib/validators';
import { handleApiError } from '@/lib/api-helpers';

// FIX: Audit #072 — skip redundant DB lookup when userId comes from verified session
const resolveActiveUserId = async (
  client: SupabaseClient,
  user: { id: string; email?: string }
): Promise<string | null> => {
  // userId from session is already verified — trust it directly
  if (user.id) {
    return user.id;
  }

  // Fallback to email lookup only if userId somehow missing
  if (!user.email) {
    return null;
  }

  const { data: byEmail } = await client
    .from('users')
    .select('id')
    .eq('email', user.email.toLowerCase())
    .maybeSingle();

  return (byEmail?.id as string | undefined) || null;
};

const triggerBatchWorkerAsync = (req: NextRequest): void => {
  const secret = process.env.BATCH_WORKER_SECRET;
  const headers: Record<string, string> = {};
  if (secret) {
    headers['x-internal-worker-key'] = secret;
  }

  void fetch(`${req.nextUrl.origin}/api/internal/batch-worker?maxJobs=3`, {
    method: 'POST',
    headers,
  }).catch((error) => {
    logger.warn('Failed to trigger internal batch worker', {
      error: error instanceof Error ? error.message : String(error),
    });
  });
};

/**
 * POST /api/invoices/bulk-upload
 * Upload ZIP file for batch processing
 */
export async function POST(req: NextRequest) {
  try {
    // FIX: Use custom auth instead of Supabase auth
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rateLimitId = getRequestIdentifier(req) + ':bulk:' + user.id;
    const rateLimit = await checkRateLimitAsync(rateLimitId, 'bulk');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: `Too many bulk uploads. Try again in ${rateLimit.resetInSeconds} seconds.` },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimit.resetInSeconds) },
        }
      );
    }

    // Get form data
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.zip')) {
      return NextResponse.json({ error: 'File must be a ZIP archive' }, { status: 400 });
    }

    // Validate file size
    if (file.size > FILE_LIMITS.MAX_ZIP_SIZE_BYTES) {
      return NextResponse.json(
        { error: `File size exceeds ${FILE_LIMITS.MAX_ZIP_SIZE_MB}MB limit` },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // FIX: Audit #032 — validate ZIP magic bytes
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      return NextResponse.json(
        { success: false, error: 'File is not a valid ZIP archive' },
        { status: 422 }
      );
    }

    // FIX: Audit #032 — ZIP bomb protection
    const { validateZipSafety } = await import('@/lib/zip-safety');
    const zipCheck = validateZipSafety(buffer);
    if (!zipCheck.safe) {
      logger.warn('ZIP safety check failed', {
        userId: user.id,
        fileName: file.name,
        reason: zipCheck.reason,
        stats: zipCheck.stats,
        audit: '#032',
      });
      return NextResponse.json(
        { success: false, error: `ZIP rejected: ${zipCheck.reason}` },
        { status: 422 }
      );
    }

    // CREDIT CHECK FIX: Estimate file count BEFORE creating job to avoid orphan jobs
    const estimatedFileCount = await batchService.estimateFileCount(buffer);

    if (estimatedFileCount > FILE_LIMITS.MAX_ZIP_FILES) {
      return NextResponse.json(
        {
          error: `This ZIP contains ${estimatedFileCount} files. Maximum is ${FILE_LIMITS.MAX_ZIP_FILES} files per batch. Please split into smaller batches.`,
        },
        { status: 400 }
      );
    }

    // P0-2: Create user-scoped client for RLS-based data isolation
    const userClient = await createUserScopedClient(user.id);
    const activeUserId = await resolveActiveUserId(userClient, user);
    if (!activeUserId) {
      return NextResponse.json(
        { error: 'User account not found. Please login again.' },
        { status: 401 }
      );
    }

    const { data: credits } = await userClient
      .from('user_credits')
      .select('available_credits')
      .eq('user_id', activeUserId)
      .single();

    const availableCredits = credits?.available_credits ?? 0;
    if (availableCredits < estimatedFileCount) {
      return NextResponse.json(
        {
          error: `Insufficient credits. You have ${availableCredits} credits but need ${estimatedFileCount} for this batch.`,
          required: estimatedFileCount,
          available: availableCredits,
        },
        { status: 402 }
      );
    }

    // Create batch job only after credit check passes
    const job = await batchService.createBatchJob(activeUserId, buffer);

    // Fire-and-forget queue processing trigger
    triggerBatchWorkerAsync(req);

    logger.info('Batch job created', {
      jobId: job.id,
      totalFiles: job.totalFiles,
      userId: user.id,
    });

    return NextResponse.json(
      {
        success: true,
        batchId: job.id,
        totalFiles: job.totalFiles,
        status: 'pending',
        message: `Batch job created with ${job.totalFiles} files. Processing will begin shortly.`,
      },
      { status: 202 }
    );
  } catch (error) {
    logger.error('Failed to process bulk upload', error);
    return handleApiError(error, 'Failed to create batch job', {
      message: 'Failed to process upload',
    });
  }
}

/**
 * GET /api/invoices/bulk-upload
 * Get batch job status
 */
export async function GET(req: NextRequest) {
  try {
    // FIX: Use custom auth instead of Supabase auth
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // P0-2: Create user-scoped client for RLS-based data isolation
    const userClient = await createUserScopedClient(user.id);
    const activeUserId = await resolveActiveUserId(userClient, user);
    if (!activeUserId) {
      return NextResponse.json(
        { error: 'User account not found. Please login again.' },
        { status: 401 }
      );
    }

    // Use 'api' preset for status polling (100 req/min) — not 'bulk' (5 req/min)
    const rateLimitId = getRequestIdentifier(req) + ':bulk-status:' + activeUserId;
    const rateLimit = await checkRateLimitAsync(rateLimitId, 'api');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: `Too many requests. Try again in ${rateLimit.resetInSeconds} seconds.` },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimit.resetInSeconds) },
        }
      );
    }

    const { searchParams } = new URL(req.url);
    const batchId = searchParams.get('batchId');
    const listAll = searchParams.get('list') === 'true';

    // List all batch jobs
    if (listAll) {
      const pagination = PaginationSchema.safeParse({
        page: searchParams.get('page') ?? '1',
        limit: searchParams.get('limit') ?? '10',
      });

      if (!pagination.success) {
        return NextResponse.json({ error: 'Invalid pagination parameters' }, { status: 400 });
      }

      const { page, limit } = pagination.data;
      const { jobs, total } = await batchService.listBatchJobs(activeUserId, page, limit);
      return NextResponse.json({
        success: true,
        jobs,
        total,
        page,
        limit,
      });
    }

    // Get specific batch status
    if (!batchId) {
      return NextResponse.json({ error: 'Batch ID is required' }, { status: 400 });
    }

    const status = await batchService.getBatchStatus(activeUserId, batchId);

    if (!status) {
      return NextResponse.json({ error: 'Batch job not found' }, { status: 404 });
    }

    // Self-healing: if job is stuck as 'pending' for >10s, re-trigger the worker (EXP-1)
    if (status.status === 'pending' && status.createdAt) {
      const ageMs = Date.now() - new Date(status.createdAt).getTime();
      if (ageMs > 10_000) {
        logger.warn('Batch job stuck in pending, re-triggering worker', { batchId, ageMs });
        triggerBatchWorkerAsync(req);
      }
    }

    // FIX (BUG-031): If completed, include SIGNED download URL
    let downloadUrl: string | undefined;
    const isTerminal = status.status === 'completed' || status.status === 'partial_success';
    const hasSuccess = status.results.some((r) => r.status === 'success');
    // Fallback: all files processed but status stuck at 'processing' (final update failed)
    const allProcessed =
      status.totalFiles > 0 && status.completedFiles + status.failedFiles >= status.totalFiles;

    if ((isTerminal || allProcessed) && hasSuccess) {
      // Create signed download token (valid for 1 hour)
      const token = createSignedDownloadToken(activeUserId, 'batch', batchId);
      downloadUrl = `/api/invoices/bulk-upload/download?batchId=${batchId}&token=${encodeURIComponent(token)}`;
    }

    return NextResponse.json({
      success: true,
      ...status,
      downloadUrl,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to get batch status', {
      message: 'Failed to get batch status',
    });
  }
}

/**
 * DELETE /api/invoices/bulk-upload
 * Cancel a batch job
 */
export async function DELETE(req: NextRequest) {
  try {
    // FIX: Use custom auth instead of Supabase auth
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // P0-2: Create user-scoped client for RLS-based data isolation
    const userClient = await createUserScopedClient(user.id);
    const activeUserId = await resolveActiveUserId(userClient, user);
    if (!activeUserId) {
      return NextResponse.json(
        { error: 'User account not found. Please login again.' },
        { status: 401 }
      );
    }

    // Use 'api' preset for cancel operations (100 req/min) — not 'bulk' (5 req/min)
    const rateLimitId = getRequestIdentifier(req) + ':bulk-cancel:' + activeUserId;
    const rateLimit = await checkRateLimitAsync(rateLimitId, 'api');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: `Too many requests. Try again in ${rateLimit.resetInSeconds} seconds.` },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimit.resetInSeconds) },
        }
      );
    }

    const { searchParams } = new URL(req.url);
    const batchId = searchParams.get('batchId');

    if (!batchId) {
      return NextResponse.json({ error: 'Batch ID is required' }, { status: 400 });
    }

    const cancelled = await batchService.cancelBatchJob(activeUserId, batchId);

    if (!cancelled) {
      // FIX (BUG-040): Return proper status code
      return NextResponse.json(
        { error: 'Failed to cancel batch job. It may already be completed or not found.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Batch job cancelled',
    });
  } catch (error) {
    return handleApiError(error, 'Failed to cancel batch job', {
      message: 'Failed to cancel batch job',
    });
  }
}
