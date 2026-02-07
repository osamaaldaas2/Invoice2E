/**
 * Admin Transaction Refund API
 * POST /api/admin/transactions/[id]/refund - Refund a transaction (super_admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, getClientIp, getUserAgent } from '@/lib/authorization';
import { adminTransactionService } from '@/services/admin';
import { z } from 'zod';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';
import { handleApiError } from '@/lib/api-helpers';

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
        let transactionId: string | undefined;
        try {
            transactionId = (await context.params).id;
        } catch {
            // params resolution failed, proceed without transactionId
        }
        const extra = {
            transactionId,
            ...(error instanceof z.ZodError ? { details: error.errors } : {})
        };

        return handleApiError(error, 'Admin refund error', {
            includeSuccess: true,
            message: 'Failed to process refund',
            extra
        });
    }
}

export async function OPTIONS(): Promise<NextResponse> {
    return NextResponse.json({}, { status: 200 });
}
