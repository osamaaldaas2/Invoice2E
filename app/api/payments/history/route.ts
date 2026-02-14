/**
 * Payment History API Route
 * Returns user's payment history
 *
 * @route /api/payments/history
 */

import { NextRequest, NextResponse } from 'next/server';
import { paymentProcessor } from '@/services/payment-processor';
import { createUserScopedClient } from '@/lib/supabase.server';
import { getAuthenticatedUser } from '@/lib/auth';
import { handleApiError } from '@/lib/api-helpers';
import { PaginationSchema } from '@/lib/validators';

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

        // P0-2: Create user-scoped client for RLS-based data isolation
        const supabase = await createUserScopedClient(user.id);

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
        return handleApiError(error, 'Failed to get payment history');
    }
}
