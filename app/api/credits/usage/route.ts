import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase.server';
import { getAuthenticatedUser } from '@/lib/auth';
import { logger } from '@/lib/logger';

type CreditUsageResponse = {
    availableCredits: number;
    usedCreditsThisMonth: number;
    usedCreditsTotal: number;
    source: 'credit_transactions' | 'fallback';
};

export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = createServerClient();
        const now = new Date();
        const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

        const { data: credits, error: creditError } = await supabase
            .from('user_credits')
            .select('available_credits, used_credits')
            .eq('user_id', user.id)
            .single();

        if (creditError) {
            logger.error('Failed to fetch user credits', { userId: user.id, error: creditError.message });
            return NextResponse.json({ error: 'Failed to fetch credits' }, { status: 500 });
        }

        let usedCreditsThisMonth = 0;
        let source: CreditUsageResponse['source'] = 'credit_transactions';

        try {
            const { data: txData, error: txError } = await supabase
                .from('credit_transactions')
                .select('amount, source, created_at')
                .eq('user_id', user.id)
                .lt('amount', 0)
                .gte('created_at', startOfMonth.toISOString());

            if (txError) {
                throw txError;
            }

            const allowedSources = new Set(['extraction', 'batch_extraction', 'conversion']);
            usedCreditsThisMonth = (txData || [])
                .filter((row) => allowedSources.has(row.source))
                .reduce((sum, row) => sum + Math.abs(Number(row.amount || 0)), 0);
        } catch (txError) {
            source = 'fallback';

            // Fallback: count invoice extractions created this month
            let extractionCount = 0;
            const { count: extractionTotal, error: extractionError } = await supabase
                .from('invoice_extractions')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .gte('created_at', startOfMonth.toISOString());

            if (!extractionError) {
                extractionCount = extractionTotal || 0;
            } else {
                logger.warn('Failed to count invoice extractions for credit usage fallback', {
                    userId: user.id,
                    error: extractionError.message,
                });
            }

            // Fallback: count successful batch results created this month
            let batchSuccessCount = 0;
            const { data: batchJobs, error: batchError } = await supabase
                .from('batch_jobs')
                .select('results')
                .eq('user_id', user.id)
                .gte('created_at', startOfMonth.toISOString());

            if (!batchError && Array.isArray(batchJobs)) {
                for (const job of batchJobs) {
                    const results = Array.isArray(job?.results) ? job.results : [];
                    batchSuccessCount += results.filter((item: any) => item?.status === 'success').length;
                }
            } else if (batchError) {
                logger.warn('Failed to count batch usage for credit usage fallback', {
                    userId: user.id,
                    error: batchError.message,
                });
            }

            usedCreditsThisMonth = extractionCount + batchSuccessCount;
        }

        return NextResponse.json({
            availableCredits: credits?.available_credits || 0,
            usedCreditsThisMonth,
            usedCreditsTotal: credits?.used_credits || 0,
            source,
        } satisfies CreditUsageResponse);
    } catch (error) {
        logger.error('Credit usage endpoint failed', { error });
        return NextResponse.json({ error: 'Failed to fetch credit usage' }, { status: 500 });
    }
}

