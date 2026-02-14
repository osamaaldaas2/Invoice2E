import { NextRequest, NextResponse } from 'next/server';
import { createUserScopedClient } from '@/lib/supabase.server';
import { getAuthenticatedUser } from '@/lib/auth';
import { handleApiError } from '@/lib/api-helpers';

export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
        const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        // P0-2: Create user-scoped client for RLS-based data isolation
        const supabase = await createUserScopedClient(user.id);

        const { data, error, count } = await supabase
            .from('credit_transactions')
            .select(
                'id, amount, transaction_type, source, reference_id, balance_after, created_at',
                { count: 'exact' }
            )
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) {
            return NextResponse.json({ success: false, error: 'Failed to fetch credit history' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            items: data || [],
            total: count || 0,
            page,
            limit,
        });
    } catch (error) {
        return handleApiError(error, 'Credit history endpoint failed', {
            message: 'Failed to fetch credit history',
        });
    }
}
