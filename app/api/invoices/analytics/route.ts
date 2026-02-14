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
import { createUserScopedClient } from '@/lib/supabase.server';

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

        // P0-3: Create user-scoped client for RLS-based data isolation
        const userClient = await createUserScopedClient(user.id);

        const { searchParams } = new URL(req.url);
        const periodParam = searchParams.get('period') || 'month';
        const validPeriods: readonly string[] = ['week', 'month', 'year'];
        const period = validPeriods.includes(periodParam)
            ? (periodParam as 'week' | 'month' | 'year')
            : 'month';
        const type = searchParams.get('type'); // 'stats', 'charts', or both

        // Get statistics (RLS enforced)
        const statistics = type !== 'charts'
            ? await analyticsService.getStatistics(user.id, userClient)
            : null;

        // Get charts data (RLS enforced)
        const chartsData = type !== 'stats'
            ? await analyticsService.getChartsData(user.id, period, userClient)
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
