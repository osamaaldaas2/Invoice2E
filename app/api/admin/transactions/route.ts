/**
 * Admin Transactions API
 * GET /api/admin/transactions - Get paginated list of transactions
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authorization';
import { adminTransactionService } from '@/services/admin';
import { logger } from '@/lib/logger';
import { UnauthorizedError, ForbiddenError } from '@/lib/errors';
import { AdminTransactionsFilter } from '@/types/admin';

export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        // Require admin role
        await requireAdmin(request);

        // Parse query parameters
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
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

        logger.error('Admin transactions list error', { error });
        return NextResponse.json(
            { success: false, error: 'Failed to fetch transactions' },
            { status: 500 }
        );
    }
}

export async function OPTIONS(): Promise<NextResponse> {
    return NextResponse.json({}, { status: 200 });
}
