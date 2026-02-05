/**
 * Admin Stats API
 * GET /api/admin/stats - Get dashboard statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, getClientIp, getUserAgent } from '@/lib/authorization';
import { adminStatsService } from '@/services/admin';
import { logger } from '@/lib/logger';
import { UnauthorizedError, ForbiddenError } from '@/lib/errors';

export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        // Require admin role
        const admin = await requireAdmin(request);

        // Get dashboard stats
        const stats = await adminStatsService.getDashboardStats();

        return NextResponse.json({
            success: true,
            data: stats,
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

        logger.error('Admin stats error', { error });
        return NextResponse.json(
            { success: false, error: 'Failed to fetch stats' },
            { status: 500 }
        );
    }
}

export async function OPTIONS(): Promise<NextResponse> {
    return NextResponse.json({}, { status: 200 });
}
