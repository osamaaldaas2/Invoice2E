/**
 * Bulk Upload API Route
 * Handles batch invoice processing
 *
 * @route /api/invoices/bulk-upload
 */

import { NextRequest, NextResponse } from 'next/server';
import { batchService } from '@/services/batch.service';
import { createServerClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import { getAuthenticatedUser } from '@/lib/auth';
import { createSignedDownloadToken } from '@/lib/session';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';
import { PaginationSchema } from '@/lib/validators';
import { handleApiError } from '@/lib/api-helpers';

/**
 * POST /api/invoices/bulk-upload
 * Upload ZIP file for batch processing
 */
export async function POST(req: NextRequest) {
    try {
        // FIX: Use custom auth instead of Supabase auth
        const user = await getAuthenticatedUser(req);
        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const rateLimitId = getRequestIdentifier(req) + ':bulk:' + user.id;
        const rateLimit = await checkRateLimitAsync(rateLimitId, 'bulk');
        if (!rateLimit.allowed) {
            return NextResponse.json(
                { error: `Too many bulk uploads. Try again in ${rateLimit.resetInSeconds} seconds.` },
                {
                    status: 429,
                    headers: { 'Retry-After': String(rateLimit.resetInSeconds) }
                }
            );
        }

        // Get form data
        const formData = await req.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json(
                { error: 'No file provided' },
                { status: 400 }
            );
        }

        // Validate file type
        if (!file.name.toLowerCase().endsWith('.zip')) {
            return NextResponse.json(
                { error: 'File must be a ZIP archive' },
                { status: 400 }
            );
        }

        // Validate file size (500MB max)
        const maxSize = 500 * 1024 * 1024; // 500MB
        if (file.size > maxSize) {
            return NextResponse.json(
                { error: 'File size exceeds 500MB limit' },
                { status: 400 }
            );
        }

        // Convert file to buffer
        const buffer = Buffer.from(await file.arrayBuffer());

        // CREDIT CHECK FIX: Estimate file count BEFORE creating job to avoid orphan jobs
        const estimatedFileCount = await batchService.estimateFileCount(buffer);

        // Check user credits BEFORE creating job
        const supabase = createServerClient();
        const { data: credits } = await supabase
            .from('user_credits')
            .select('available_credits')
            .eq('user_id', user.id)
            .single();

        const availableCredits = credits?.available_credits || 0;
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
        const job = await batchService.createBatchJob(user.id, buffer);

        logger.info('Batch job created', { jobId: job.id, totalFiles: job.totalFiles, userId: user.id });

        return NextResponse.json({
            success: true,
            batchId: job.id,
            totalFiles: job.totalFiles,
            status: 'pending',
            message: `Batch job created with ${job.totalFiles} files. Processing will begin shortly.`,
        }, { status: 202 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to process upload';
        return handleApiError(error, 'Failed to create batch job', { message });
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
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const rateLimitId = getRequestIdentifier(req) + ':bulk:' + user.id;
        const rateLimit = await checkRateLimitAsync(rateLimitId, 'bulk');
        if (!rateLimit.allowed) {
            return NextResponse.json(
                { error: `Too many requests. Try again in ${rateLimit.resetInSeconds} seconds.` },
                {
                    status: 429,
                    headers: { 'Retry-After': String(rateLimit.resetInSeconds) }
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
                return NextResponse.json(
                    { error: 'Invalid pagination parameters' },
                    { status: 400 }
                );
            }

            const { page, limit } = pagination.data;
            const { jobs, total } = await batchService.listBatchJobs(user.id, page, limit);
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
            return NextResponse.json(
                { error: 'Batch ID is required' },
                { status: 400 }
            );
        }

        const status = await batchService.getBatchStatus(user.id, batchId);

        if (!status) {
            return NextResponse.json(
                { error: 'Batch job not found' },
                { status: 404 }
            );
        }

        // FIX (BUG-031): If completed, include SIGNED download URL
        let downloadUrl: string | undefined;
        if ((status.status === 'completed' || status.status === 'partial_success') &&
            status.results.some(r => r.status === 'success')) {
            // Create signed download token (valid for 1 hour)
            const token = createSignedDownloadToken(user.id, 'batch', batchId);
            downloadUrl = `/api/invoices/bulk-upload/download?batchId=${batchId}&token=${encodeURIComponent(token)}`;
        }

        return NextResponse.json({
            success: true,
            ...status,
            downloadUrl,
        });
    } catch (error) {
        return handleApiError(error, 'Failed to get batch status', {
            message: 'Failed to get batch status'
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
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const rateLimitId = getRequestIdentifier(req) + ':bulk:' + user.id;
        const rateLimit = await checkRateLimitAsync(rateLimitId, 'bulk');
        if (!rateLimit.allowed) {
            return NextResponse.json(
                { error: `Too many requests. Try again in ${rateLimit.resetInSeconds} seconds.` },
                {
                    status: 429,
                    headers: { 'Retry-After': String(rateLimit.resetInSeconds) }
                }
            );
        }

        const { searchParams } = new URL(req.url);
        const batchId = searchParams.get('batchId');

        if (!batchId) {
            return NextResponse.json(
                { error: 'Batch ID is required' },
                { status: 400 }
            );
        }

        const cancelled = await batchService.cancelBatchJob(user.id, batchId);

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
            message: 'Failed to cancel batch job'
        });
    }
}
