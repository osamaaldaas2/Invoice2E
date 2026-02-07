/**
 * Analytics API Route
 * Returns user statistics and charts data
 * 
 * @route /api/invoices/analytics
 */

import { NextRequest, NextResponse } from 'next/server';
import { analyticsService } from '@/services/analytics.service';
import { handleApiError } from '@/lib/api-helpers';

/**
 * GET /api/invoices/analytics
 * Get user statistics and charts data
 */
import { getAuthenticatedUser } from '@/lib/auth';

/**
 * GET /api/invoices/analytics
 * Get user statistics and charts data
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
        const period = (searchParams.get('period') || 'month') as 'week' | 'month' | 'year';
        const type = searchParams.get('type'); // 'stats', 'charts', or both

        // Get statistics
        const statistics = type !== 'charts'
            ? await analyticsService.getStatistics(user.id)
            : null;

        // Get charts data
        const chartsData = type !== 'stats'
            ? await analyticsService.getChartsData(user.id, period)
            : null;

        return NextResponse.json({
            success: true,
            ...(statistics && { statistics }),
            ...(chartsData && { charts: chartsData }),
        });
    } catch (error) {
        return handleApiError(error, 'Failed to get analytics', { message: 'Failed to get analytics' });
    }
}
