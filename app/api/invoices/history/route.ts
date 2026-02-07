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

/**
 * GET /api/invoices/history
 * Get paginated conversion history with filters
 */
import { getAuthenticatedUser } from '@/lib/auth';

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
        const format = searchParams.get('format') as 'CII' | 'UBL' | null;
        const status = searchParams.get('status') as 'valid' | 'invalid' | 'draft' | 'completed' | null;
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const exportType = searchParams.get('export');

        // Handle CSV export
        if (exportType === 'csv') {
            const csv = await analyticsService.exportHistoryAsCSV(user.id);
            return new NextResponse(csv, {
                headers: {
                    'Content-Type': 'text/csv',
                    'Content-Disposition': `attachment; filename="conversion_history_${new Date().toISOString().split('T')[0]}.csv"`,
                },
            });
        }

        // Get paginated history
        const filters = {
            ...(format && { format }),
            ...(status && { status }),
            ...(startDate && { startDate }),
            ...(endDate && { endDate }),
        };

        const history = await analyticsService.getConversionHistory(user.id, page, limit, filters);

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
