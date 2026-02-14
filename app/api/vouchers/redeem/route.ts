import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/auth';
import { createUserScopedClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import { handleApiError } from '@/lib/api-helpers';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';

const RedeemSchema = z.object({
    code: z.string().min(3).max(100),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const rateLimitId = `${getRequestIdentifier(request)}:vouchers-redeem:${user.id}`;
        const rateLimit = await checkRateLimitAsync(rateLimitId, 'api');
        if (!rateLimit.allowed) {
            return NextResponse.json(
                { success: false, error: `Too many requests. Try again in ${rateLimit.resetInSeconds} seconds.` },
                {
                    status: 429,
                    headers: { 'Retry-After': String(rateLimit.resetInSeconds) },
                }
            );
        }

        const body = await request.json();
        const validated = RedeemSchema.parse(body);
        const normalizedCode = validated.code.trim().toUpperCase();

        // P0-2: Create user-scoped client for RLS-based data isolation
        const userClient = await createUserScopedClient(user.id);

        const { data, error } = await userClient.rpc('redeem_voucher', {
            p_user_id: user.id,
            p_code: normalizedCode,
        });

        if (error) {
            const rawMessage = error.message || 'Failed to redeem voucher';
            logger.error('Voucher redeem failed', { userId: user.id, error: rawMessage });

            const lowerMessage = rawMessage.toLowerCase();
            const needsMigration = lowerMessage.includes('redeem_voucher')
                && lowerMessage.includes('does not exist');

            return NextResponse.json(
                {
                    success: false,
                    error: needsMigration
                        ? 'Voucher system is not installed. Please apply migration 014.'
                        : rawMessage,
                },
                { status: 500 }
            );
        }

        if (!data?.success) {
            return NextResponse.json({ success: false, error: data?.error || 'Voucher not valid' }, { status: 400 });
        }

        return NextResponse.json({
            success: true,
            data: {
                creditsAdded: data.credits_added,
                newBalance: data.new_balance,
            },
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ success: false, error: 'Invalid voucher code' }, { status: 400 });
        }

        return handleApiError(error, 'Voucher redeem error', {
            includeSuccess: true,
            message: 'Internal server error'
        });
    }
}
