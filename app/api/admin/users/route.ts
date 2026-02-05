/**
 * Admin Users API
 * GET /api/admin/users - Get paginated list of users
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authorization';
import { adminUserService } from '@/services/admin';
import { logger } from '@/lib/logger';
import { UnauthorizedError, ForbiddenError, AppError } from '@/lib/errors';
import { AdminUsersFilter } from '@/types/admin';
import { UserRole } from '@/types/index';

export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        // Require admin role
        await requireAdmin(request);

        // Parse query parameters
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
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

        logger.error('Admin users list error', { error });
        return NextResponse.json(
            { success: false, error: 'Failed to fetch users' },
            { status: 500 }
        );
    }
}

export async function OPTIONS(): Promise<NextResponse> {
    return NextResponse.json({}, { status: 200 });
}
