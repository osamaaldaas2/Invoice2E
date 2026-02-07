import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';

const RedeemSchema = z.object({
    code: z.string().min(3),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const validated = RedeemSchema.parse(body);
        const normalizedCode = validated.code.trim().toUpperCase();

        const supabase = createServerClient();

        const { data, error } = await supabase.rpc('redeem_voucher', {
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

        logger.error('Voucher redeem error', { error });
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
