/**
 * Admin User Detail API
 * GET /api/admin/users/[id] - Get user details
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authorization';
import { adminUserService } from '@/services/admin';
import { logger } from '@/lib/logger';
import { UnauthorizedError, ForbiddenError, NotFoundError } from '@/lib/errors';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    try {
        // Require admin role
        const admin = await requireAdmin(request);

        const { id: userId } = await context.params;

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

        // Get user details
        const user = await adminUserService.getUserById(userId);

        return NextResponse.json({
            success: true,
            data: user,
        });
    } catch (error) {
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

        const { id: userId } = await context.params;
        logger.error('Admin user detail error', { error, userId });
        return NextResponse.json(
            { success: false, error: 'Failed to fetch user' },
            { status: 500 }
        );
    }
}

export async function OPTIONS(): Promise<NextResponse> {
    return NextResponse.json({}, { status: 200 });
}
