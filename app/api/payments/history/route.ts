/**
 * Payment History API Route
 * Returns user's payment history
 *
 * @route /api/payments/history
 */

import { NextRequest, NextResponse } from 'next/server';
import { paymentProcessor } from '@/services/payment-processor';
import { createServerClient } from '@/lib/supabase.server';
import { getAuthenticatedUser } from '@/lib/auth';
import { logger } from '@/lib/logger';

/**
 * GET /api/payments/history
 * Get user's payment history
 */
export async function GET(req: NextRequest) {
    try {
        // AUTH FIX: Use custom JWT session instead of Supabase auth
        const user = await getAuthenticatedUser(req);

        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const supabase = createServerClient();

        // Parse query parameters
        const { searchParams } = new URL(req.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);

        const history = await paymentProcessor.getPaymentHistory(user.id, page, limit);

        // Also get current credit balance
        const { data: credits } = await supabase
            .from('user_credits')
            .select('available_credits, used_credits')
            .eq('user_id', user.id)
            .single();

        return NextResponse.json({
            success: true,
            ...history,
            currentCredits: credits?.available_credits || 0,
            usedCredits: credits?.used_credits || 0,
        });
    } catch (error) {
        logger.error('Failed to get payment history', { error });
        return NextResponse.json(
            { error: 'Failed to get payment history' },
            { status: 500 }
        );
    }
}
