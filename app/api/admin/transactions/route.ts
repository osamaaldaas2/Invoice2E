/**
 * Admin Transactions API
 * GET /api/admin/transactions - Get paginated list of transactions
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authorization';
import { adminTransactionService } from '@/services/admin';
import { UnauthorizedError, ForbiddenError } from '@/lib/errors';
import { AdminTransactionsFilter } from '@/types/admin';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';
import { PaginationSchema } from '@/lib/validators';
import { handleApiError } from '@/lib/api-helpers';
import { z } from 'zod';

// FIX: Audit V2 [F-002] — Zod validation for all admin transaction query params
const TransactionFiltersSchema = z.object({
  userId: z.string().uuid().optional(),
  status: z.enum(['completed', 'pending', 'failed', 'refunded']).optional(),
  paymentMethod: z.enum(['stripe', 'paypal', 'voucher', 'manual']).optional(),
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
      limit: searchParams.get('limit') ?? '20',
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
    for (const key of ['userId', 'status', 'paymentMethod', 'startDate', 'endDate']) {
      const val = searchParams.get(key);
      if (val) rawFilters[key] = val;
    }
    const filterResult = TransactionFiltersSchema.safeParse(rawFilters);
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

    const filters: AdminTransactionsFilter = filterResult.data;

    // Get transactions
    const { transactions, total } = await adminTransactionService.getAllTransactions(
      page,
      limit,
      filters
    );

    return NextResponse.json({
      success: true,
      data: {
        transactions,
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

    return handleApiError(error, 'Admin transactions list error', {
      message: 'Failed to fetch transactions',
      includeSuccess: true,
    });
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return NextResponse.json({}, { status: 200 });
}
