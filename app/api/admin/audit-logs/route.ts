/**
 * Admin Audit Logs API
 * GET /api/admin/audit-logs - Get paginated audit logs
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authorization';
import { adminAuditService } from '@/services/admin';
import { logger } from '@/lib/logger';
import { UnauthorizedError, ForbiddenError } from '@/lib/errors';
import { AdminAuditLogsFilter, AdminAction } from '@/types/admin';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';

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
        const page = parseInt(searchParams.get('page') || '1');
        const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
        const adminUserId = searchParams.get('adminUserId') || undefined;
        const targetUserId = searchParams.get('targetUserId') || undefined;
        const action = searchParams.get('action') as AdminAction | undefined;
        const resourceType = searchParams.get('resourceType') || undefined;
        const startDate = searchParams.get('startDate') || undefined;
        const endDate = searchParams.get('endDate') || undefined;

        const filters: AdminAuditLogsFilter = {
            adminUserId,
            targetUserId,
            action,
            resourceType,
            startDate,
            endDate,
        };

        // Get audit logs
        const { logs, total } = await adminAuditService.getAuditLogs(page, limit, filters);

        return NextResponse.json({
            success: true,
            data: {
                logs,
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

        logger.error('Admin audit logs error', { error });
        return NextResponse.json(
            { success: false, error: 'Failed to fetch audit logs' },
            { status: 500 }
        );
    }
}

export async function OPTIONS(): Promise<NextResponse> {
    return NextResponse.json({}, { status: 200 });
}
