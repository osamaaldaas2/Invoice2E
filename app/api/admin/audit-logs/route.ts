/**
 * Admin Audit Logs API
 * GET /api/admin/audit-logs - Get paginated audit logs
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authorization';
import { adminAuditService } from '@/services/admin';
import { UnauthorizedError, ForbiddenError } from '@/lib/errors';
import { AdminAuditLogsFilter } from '@/types/admin';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';
import { PaginationSchema } from '@/lib/validators';
import { handleApiError } from '@/lib/api-helpers';
import { z } from 'zod';

// FIX: Audit V2 [F-002] — Zod validation for all admin audit query params
const AuditFiltersSchema = z.object({
  adminUserId: z.string().uuid().optional(),
  targetUserId: z.string().uuid().optional(),
  action: z
    .enum([
      'user_banned',
      'user_unbanned',
      'credits_added',
      'credits_removed',
      'role_changed',
      'package_created',
      'package_updated',
      'package_deleted',
      'transaction_refunded',
    ])
    .optional(),
  resourceType: z
    .enum(['user', 'package', 'transaction', 'system', 'credits', 'voucher'])
    .optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/)
    .optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Require admin role
    const admin = await requireAdmin(request);

    const rateLimitId = getRequestIdentifier(request) + ':admin:' + admin.id;
    const rateLimit = await checkRateLimitAsync(rateLimitId, 'admin');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many requests. Try again in ${rateLimit.resetInSeconds} seconds.`,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimit.resetInSeconds) },
        }
      );
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const pagination = PaginationSchema.safeParse({
      page: searchParams.get('page') ?? '1',
      limit: searchParams.get('limit') ?? '50',
    });

    if (!pagination.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid pagination parameters' },
        { status: 400 }
      );
    }

    const { page, limit } = pagination.data;

    // FIX: Audit V2 [F-002] — validate all filter params with Zod
    const rawFilters: Record<string, string> = {};
    for (const key of [
      'adminUserId',
      'targetUserId',
      'action',
      'resourceType',
      'startDate',
      'endDate',
    ]) {
      const val = searchParams.get(key);
      if (val) rawFilters[key] = val;
    }
    const filterResult = AuditFiltersSchema.safeParse(rawFilters);
    if (!filterResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid filter parameters',
          details: filterResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const filters: AdminAuditLogsFilter = filterResult.data;

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
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }

    return handleApiError(error, 'Admin audit logs error', {
      message: 'Failed to fetch audit logs',
      includeSuccess: true,
    });
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return NextResponse.json({}, { status: 200 });
}
