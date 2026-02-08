/**
 * Admin User Detail API
 * GET /api/admin/users/[id] - Get user details
 * PATCH /api/admin/users/[id] - Update user role (super_admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, requireSuperAdmin, getClientIp, getUserAgent } from '@/lib/authorization';
import { adminUserService } from '@/services/admin';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';
import { handleApiError } from '@/lib/api-helpers';
import { z } from 'zod';

const UpdateRoleSchema = z.object({
    role: z.enum(['user', 'admin', 'super_admin']),
});

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
        const { id: userId } = await context.params;
        return handleApiError(error, 'Admin user detail error', {
            includeSuccess: true,
            message: 'Failed to fetch user',
            extra: { userId }
        });
    }
}

export async function OPTIONS(): Promise<NextResponse> {
    return NextResponse.json({}, { status: 200 });
}

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    let userId: string | undefined;
    try {
        const admin = await requireSuperAdmin(request);
        const { id } = await context.params;
        userId = id;

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

        const body = await request.json();
        const { role } = UpdateRoleSchema.parse(body);

        const updated = await adminUserService.changeRole(
            { userId, newRole: role },
            admin.id,
            getClientIp(request),
            getUserAgent(request)
        );

        return NextResponse.json({
            success: true,
            data: updated,
            message: 'Role updated successfully',
        });
    } catch (error) {
        return handleApiError(error, 'Admin user role update error', {
            includeSuccess: true,
            message: 'Failed to update role',
            extra: userId ? { userId } : undefined,
        });
    }
}
