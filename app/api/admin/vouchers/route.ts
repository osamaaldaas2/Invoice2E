import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuperAdmin, getClientIp, getUserAgent } from '@/lib/authorization';
import { createServerClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import { adminAuditService } from '@/services/admin';
import { isValidUUID } from '@/lib/database-helpers';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';
import { handleApiError } from '@/lib/api-helpers';

const VoucherSchema = z.object({
    code: z.string().min(3).max(50),
    description: z.string().max(500).optional().nullable(),
    credits: z.number().int().min(1),
    isActive: z.boolean().default(true),
    appliesToAll: z.boolean().default(true),
    allowedUsers: z.string().optional().nullable(),
    maxRedemptions: z.number().int().min(1).optional().nullable(),
    maxRedemptionsPerUser: z.number().int().min(1).optional().nullable(),
    validFrom: z.string().optional().nullable(),
    validUntil: z.string().optional().nullable(),
});

const parseAllowedUsers = async (raw: string | null | undefined, supabase: ReturnType<typeof createServerClient>) => {
    if (!raw) {
        return [];
    }

    const tokens = raw
        .split(/[,;\n]/)
        .map((value) => value.trim())
        .filter((value) => value.length > 0);

    if (tokens.length === 0) {
        return [];
    }

    const ids: string[] = [];

    for (const token of tokens) {
        if (token.includes('@')) {
            const { data, error } = await supabase
                .from('users')
                .select('id')
                .eq('email', token.toLowerCase())
                .single();

            if (error || !data?.id) {
                throw new Error(`User not found for email: ${token}`);
            }

            ids.push(data.id);
            continue;
        }

        if (!isValidUUID(token)) {
            throw new Error(`Invalid user identifier: ${token}`);
        }

        ids.push(token);
    }

    return ids;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        const admin = await requireSuperAdmin(request);
        const rateLimitId = getRequestIdentifier(request) + ':admin:' + admin.id;
        const rateLimit = await checkRateLimitAsync(rateLimitId, 'admin');
        if (!rateLimit.allowed) {
            return NextResponse.json(
                { success: false, error: `Too many requests. Try again in ${rateLimit.resetInSeconds} seconds.` },
                {
                    status: 429,
                    headers: { 'Retry-After': String(rateLimit.resetInSeconds) }
                }
            );
        }
        const supabase = createServerClient();

        const { data: vouchers, error } = await supabase
            .from('vouchers')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            logger.error('Failed to fetch vouchers', { error: error.message });
            return NextResponse.json({ success: false, error: 'Failed to fetch vouchers' }, { status: 500 });
        }

        const formatted = vouchers.map((voucher) => ({
            id: voucher.id,
            code: voucher.code,
            description: voucher.description,
            credits: voucher.credits,
            isActive: voucher.is_active,
            appliesToAll: voucher.applies_to_all,
            allowedUserIds: voucher.allowed_user_ids || [],
            maxRedemptions: voucher.max_redemptions,
            maxRedemptionsPerUser: voucher.max_redemptions_per_user,
            validFrom: voucher.valid_from,
            validUntil: voucher.valid_until,
            redemptionCount: voucher.redemption_count,
            createdAt: voucher.created_at,
            updatedAt: voucher.updated_at,
        }));

        return NextResponse.json({ success: true, data: { vouchers: formatted } });
    } catch (error) {
        return handleApiError(error, 'Admin vouchers list error', { includeSuccess: true });
    }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        const admin = await requireSuperAdmin(request);
        const rateLimitId = getRequestIdentifier(request) + ':admin:' + admin.id;
        const rateLimit = await checkRateLimitAsync(rateLimitId, 'admin');
        if (!rateLimit.allowed) {
            return NextResponse.json(
                { success: false, error: `Too many requests. Try again in ${rateLimit.resetInSeconds} seconds.` },
                {
                    status: 429,
                    headers: { 'Retry-After': String(rateLimit.resetInSeconds) }
                }
            );
        }
        const body = await request.json();
        const validated = VoucherSchema.parse(body);

        const supabase = createServerClient();
        const allowedUserIds = await parseAllowedUsers(validated.allowedUsers, supabase);

        if (!validated.appliesToAll && allowedUserIds.length === 0) {
            return NextResponse.json(
                { success: false, error: 'Allowed users required when appliesToAll is false' },
                { status: 400 }
            );
        }

        const validFrom = validated.validFrom ? new Date(validated.validFrom).toISOString() : null;
        const validUntil = validated.validUntil ? new Date(validated.validUntil).toISOString() : null;

        if (validFrom && validUntil && new Date(validUntil) < new Date(validFrom)) {
            return NextResponse.json(
                { success: false, error: 'Valid until must be after valid from' },
                { status: 400 }
            );
        }

        const { data: newVoucher, error } = await supabase
            .from('vouchers')
            .insert([
                {
                    code: validated.code.trim().toUpperCase(),
                    description: validated.description || null,
                    credits: validated.credits,
                    is_active: validated.isActive,
                    applies_to_all: validated.appliesToAll,
                    allowed_user_ids: validated.appliesToAll ? null : allowedUserIds,
                    max_redemptions: validated.maxRedemptions || null,
                    max_redemptions_per_user: validated.maxRedemptionsPerUser || null,
                    valid_from: validFrom,
                    valid_until: validUntil,
                },
            ])
            .select()
            .single();

        if (error) {
            logger.error('Failed to create voucher', { error: error.message });
            return NextResponse.json({ success: false, error: 'Failed to create voucher' }, { status: 500 });
        }

        await adminAuditService.logAdminAction({
            adminUserId: admin.id,
            action: 'voucher_created',
            resourceType: 'voucher',
            resourceId: newVoucher.id,
            newValues: { code: newVoucher.code, credits: newVoucher.credits },
            ipAddress: getClientIp(request),
            userAgent: getUserAgent(request),
        });

        return NextResponse.json({ success: true, data: { voucher: newVoucher } }, { status: 201 });
    } catch (error) {
        const extra = error instanceof z.ZodError ? { details: error.errors } : undefined;
        const isPlainError = error instanceof Error && !(error instanceof z.ZodError);

        return handleApiError(error, 'Admin create voucher error', {
            includeSuccess: true,
            extra,
            status: isPlainError ? 400 : undefined,
            message: isPlainError ? error.message : 'Internal server error'
        });
    }
}
