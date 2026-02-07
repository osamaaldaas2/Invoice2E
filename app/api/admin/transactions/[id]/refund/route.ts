/**
 * Admin Transaction Refund API
 * POST /api/admin/transactions/[id]/refund - Refund a transaction (super_admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, getClientIp, getUserAgent } from '@/lib/authorization';
import { adminTransactionService } from '@/services/admin';
import { logger } from '@/lib/logger';
import { UnauthorizedError, ForbiddenError, NotFoundError, AppError } from '@/lib/errors';
import { z } from 'zod';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';

const RefundSchema = z.object({
    reason: z.string().min(10, 'Reason must be at least 10 characters'),
});

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    try {
        // Require SUPER ADMIN for refunds - dangerous operation
        const admin = await requireSuperAdmin(request);

        const { id: transactionId } = await context.params;
        const body = await request.json();

        const rateLimitId = getRequestIdentifier(request) + ':admin:' + admin.id;
        const rateLimit = await checkRateLimitAsync(rateLimitId, 'admin');
        if (!rateLimit.allowed) {
            return NextResponse.json(
                { success: false, error: `Too many requests. Try again in ${rateLimit.resetInSeconds} seconds.` },
                {
                    status: 429,
                    headers: { 'Retry-After': String(rateLimit.resetInSeconds) }
                }
            );
        }

        // Validate input
        const { reason } = RefundSchema.parse(body);

        // Get request context
        const ipAddress = getClientIp(request);
        const userAgent = getUserAgent(request);

        // Process refund
        const transaction = await adminTransactionService.refundTransaction(
            { transactionId, reason },
            admin.id,
            ipAddress,
            userAgent
        );

        return NextResponse.json({
            success: true,
            data: transaction,
            message: 'Transaction refunded successfully',
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: error.errors[0]?.message || 'Validation failed' },
                { status: 400 }
            );
        }
        if (error instanceof UnauthorizedError) {
            return NextResponse.json(
                { success: false, error: error.message },
                { status: 401 }
            );
        }
        if (error instanceof ForbiddenError) {
            return NextResponse.json(
                { success: false, error: error.message },
                { status: 403 }
            );
        }
        if (error instanceof NotFoundError) {
            return NextResponse.json(
                { success: false, error: error.message },
                { status: 404 }
            );
        }
        if (error instanceof AppError) {
            return NextResponse.json(
                { success: false, error: error.message },
                { status: error.statusCode }
            );
        }

        const { id: transactionId } = await context.params;
        logger.error('Admin refund error', { error, transactionId });
        return NextResponse.json(
            { success: false, error: 'Failed to process refund' },
            { status: 500 }
        );
    }
}

export async function OPTIONS(): Promise<NextResponse> {
    return NextResponse.json({}, { status: 200 });
}
