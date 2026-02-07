/**
 * Admin Users API
 * GET /api/admin/users - Get paginated list of users
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authorization';
import { adminUserService } from '@/services/admin';
import { UnauthorizedError, ForbiddenError } from '@/lib/errors';
import { AdminUsersFilter } from '@/types/admin';
import { UserRole } from '@/types/index';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';
import { PaginationSchema } from '@/lib/validators';
import { handleApiError } from '@/lib/api-helpers';

export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        // Require admin role
        const admin = await requireAdmin(request);

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

        // Parse query parameters
        const { searchParams } = new URL(request.url);
        const pagination = PaginationSchema.safeParse({
            page: searchParams.get('page') ?? '1',
            limit: searchParams.get('limit') ?? '20',
        });

        if (!pagination.success) {
            return NextResponse.json(
                { success: false, error: 'Invalid pagination parameters' },
                { status: 400 }
            );
        }

        const { page, limit } = pagination.data;
        const search = searchParams.get('search') || undefined;
        const role = searchParams.get('role') as UserRole | undefined;
        const isBanned = searchParams.get('isBanned');
        const sortBy = searchParams.get('sortBy') as AdminUsersFilter['sortBy'];
        const sortOrder = searchParams.get('sortOrder') as 'asc' | 'desc';

        const filters: AdminUsersFilter = {
            search,
            role,
            isBanned: isBanned === 'true' ? true : isBanned === 'false' ? false : undefined,
            sortBy,
            sortOrder,
        };

        // Get users
        const { users, total } = await adminUserService.getAllUsers(page, limit, filters);

        return NextResponse.json({
            success: true,
            data: {
                users,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit),
                },
            },
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

        return handleApiError(error, 'Admin users list error', {
            message: 'Failed to fetch users',
            includeSuccess: true,
        });
    }
}

export async function OPTIONS(): Promise<NextResponse> {
    return NextResponse.json({}, { status: 200 });
}
