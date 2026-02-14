/**
 * History API Route
 * Returns user's conversion history
 * 
 * @route /api/invoices/history
 */

import { NextRequest, NextResponse } from 'next/server';
import { analyticsService } from '@/services/analytics.service';

import { PaginationSchema } from '@/lib/validators';
import { handleApiError } from '@/lib/api-helpers';

import { getAuthenticatedUser } from '@/lib/auth';
import { createUserScopedClient } from '@/lib/supabase.server';

/**
 * GET /api/invoices/history
 * Get paginated conversion history with filters
 */
export async function GET(req: NextRequest) {
    try {
        const user = await getAuthenticatedUser(req);

        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // P0-3: Create user-scoped client for RLS-based data isolation
        const userClient = await createUserScopedClient(user.id);

        // Parse query parameters
        const { searchParams } = new URL(req.url);
        const pagination = PaginationSchema.safeParse({
            page: searchParams.get('page') ?? '1',
            limit: searchParams.get('limit') ?? '20',
        });

        if (!pagination.success) {
            return NextResponse.json(
                { error: 'Invalid pagination parameters' },
                { status: 400 }
            );
        }

        const { page, limit } = pagination.data;
        const formatParam = searchParams.get('format');
        const format = formatParam && ['CII', 'UBL'].includes(formatParam)
            ? (formatParam as 'CII' | 'UBL')
            : null;

        const statusParam = searchParams.get('status');
        const status = statusParam && ['valid', 'invalid', 'draft', 'completed'].includes(statusParam)
            ? (statusParam as 'valid' | 'invalid' | 'draft' | 'completed')
            : null;
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate'); const exportType = searchParams.get('export');

        // Handle CSV export (RLS enforced)
        if (exportType === 'csv') {
            const csv = await analyticsService.exportHistoryAsCSV(user.id, userClient);
            return new NextResponse(csv, {
                headers: {
                    'Content-Type': 'text/csv',
                    'Content-Disposition': `attachment; filename="conversion_history_${new Date().toISOString().split('T')[0]}.csv"`,
                },
            });
        }

        // Get paginated history (RLS enforced)
        const filters = {
            ...(format && { format }),
            ...(status && { status }),
            ...(startDate && { startDate }),
            ...(endDate && { endDate }),
        };

        const history = await analyticsService.getConversionHistory(user.id, page, limit, filters, userClient);

        return NextResponse.json({
            success: true,
            ...history,
        });
    } catch (error) {
        return handleApiError(error, 'Failed to get conversion history', {
            message: 'Failed to get conversion history',
        });
    }
}
