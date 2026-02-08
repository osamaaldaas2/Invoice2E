/**
 * Admin User Ban API
 * POST /api/admin/users/[id]/ban - Ban or unban a user
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, getClientIp, getUserAgent } from '@/lib/authorization';
import { adminUserService } from '@/services/admin';
import { z } from 'zod';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';
import { handleApiError } from '@/lib/api-helpers';

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

        const targetUser = await adminUserService.getUserById(userId);
        if (targetUser.role === 'super_admin') {
            return NextResponse.json(
                { success: false, error: 'Cannot ban super admin accounts' },
                { status: 403 }
            );
        }
        if (targetUser.role === 'admin' && admin.role !== 'super_admin') {
            return NextResponse.json(
                { success: false, error: 'Only super admin can ban admin accounts' },
                { status: 403 }
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
        const { id: userId } = await context.params;
        const extra = {
            userId,
            ...(error instanceof z.ZodError ? { details: error.errors } : {})
        };

        return handleApiError(error, 'Admin ban user error', {
            includeSuccess: true,
            message: 'Failed to process ban/unban',
            extra
        });
    }
}

export async function OPTIONS(): Promise<NextResponse> {
    return NextResponse.json({}, { status: 200 });
}
