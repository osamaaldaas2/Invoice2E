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
        const userId = searchParams.get('userId') || undefined;
        const status = searchParams.get('status') || undefined;
        const paymentMethod = searchParams.get('paymentMethod') || undefined;
        const startDate = searchParams.get('startDate') || undefined;
        const endDate = searchParams.get('endDate') || undefined;

        const filters: AdminTransactionsFilter = {
            userId,
            status,
            paymentMethod,
            startDate,
            endDate,
        };

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

        return handleApiError(error, 'Admin transactions list error', {
            message: 'Failed to fetch transactions',
            includeSuccess: true,
        });
    }
}

export async function OPTIONS(): Promise<NextResponse> {
    return NextResponse.json({}, { status: 200 });
}
