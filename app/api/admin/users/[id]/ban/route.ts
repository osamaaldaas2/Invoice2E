/**
 * Admin User Ban API
 * POST /api/admin/users/[id]/ban - Ban or unban a user
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, getClientIp, getUserAgent } from '@/lib/authorization';
import { adminUserService } from '@/services/admin';
import { logger } from '@/lib/logger';
import { UnauthorizedError, ForbiddenError, NotFoundError, AppError } from '@/lib/errors';
import { z } from 'zod';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';

const BanUserSchema = z.object({
    action: z.enum(['ban', 'unban']),
    reason: z.string().min(5, 'Reason must be at least 5 characters').optional(),
});

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    try {
        // Require admin role
        const admin = await requireAdmin(request);

        const { id: userId } = await context.params;
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
        const { action, reason } = BanUserSchema.parse(body);

        // Prevent self-ban
        if (userId === admin.id) {
            return NextResponse.json(
                { success: false, error: 'Cannot ban yourself' },
                { status: 400 }
            );
        }

        // Get request context
        const ipAddress = getClientIp(request);
        const userAgent = getUserAgent(request);

        let user;

        if (action === 'ban') {
            if (!reason) {
                return NextResponse.json(
                    { success: false, error: 'Reason is required when banning a user' },
                    { status: 400 }
                );
            }
            user = await adminUserService.banUser(
                { userId, reason },
                admin.id,
                ipAddress,
                userAgent
            );
        } else {
            user = await adminUserService.unbanUser(
                userId,
                admin.id,
                ipAddress,
                userAgent
            );
        }

        return NextResponse.json({
            success: true,
            data: user,
            message: action === 'ban' ? 'User banned successfully' : 'User unbanned successfully',
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

        const { id: userId } = await context.params;
        logger.error('Admin ban user error', { error, userId });
        return NextResponse.json(
            { success: false, error: 'Failed to process ban/unban' },
            { status: 500 }
        );
    }
}

export async function OPTIONS(): Promise<NextResponse> {
    return NextResponse.json({}, { status: 200 });
}
