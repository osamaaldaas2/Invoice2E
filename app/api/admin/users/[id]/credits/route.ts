/**
 * Admin User Credits API
 * POST /api/admin/users/[id]/credits - Modify user credits
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, getClientIp, getUserAgent } from '@/lib/authorization';
import { adminUserService } from '@/services/admin';
import { logger } from '@/lib/logger';
import { UnauthorizedError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { z } from 'zod';

const ModifyCreditsSchema = z.object({
    amount: z.number().int().refine((n) => n !== 0, 'Amount cannot be zero'),
    reason: z.string().min(5, 'Reason must be at least 5 characters'),
});

export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
): Promise<NextResponse> {
    try {
        // Require admin role
        const admin = await requireAdmin(request);

        const userId = params.id;
        const body = await request.json();

        // Validate input
        const { amount, reason } = ModifyCreditsSchema.parse(body);

        // Get request context
        const ipAddress = getClientIp(request);
        const userAgent = getUserAgent(request);

        // Modify credits
        const result = await adminUserService.modifyCredits(
            { userId, amount, reason },
            admin.id,
            ipAddress,
            userAgent
        );

        return NextResponse.json({
            success: true,
            data: {
                userId,
                newBalance: result.newBalance,
                change: amount,
                auditLogId: result.auditLogId,
            },
            message: amount > 0 ? 'Credits added successfully' : 'Credits removed successfully',
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

        logger.error('Admin modify credits error', { error, userId: params.id });
        return NextResponse.json(
            { success: false, error: 'Failed to modify credits' },
            { status: 500 }
        );
    }
}

export async function OPTIONS(): Promise<NextResponse> {
    return NextResponse.json({}, { status: 200 });
}
