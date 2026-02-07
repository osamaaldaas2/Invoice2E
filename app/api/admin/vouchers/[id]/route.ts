import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuperAdmin, getClientIp, getUserAgent } from '@/lib/authorization';
import { createServerClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import { adminAuditService } from '@/services/admin';
import { isValidUUID } from '@/lib/database-helpers';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';

const UpdateVoucherSchema = z.object({
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

export async function PUT(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
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
        const validated = UpdateVoucherSchema.parse(body);
        const { id } = await context.params;

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

        const { data: updatedVoucher, error } = await supabase
            .from('vouchers')
            .update({
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
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            logger.error('Failed to update voucher', { error: error.message });
            return NextResponse.json({ success: false, error: 'Failed to update voucher' }, { status: 500 });
        }

        await adminAuditService.logAdminAction({
            adminUserId: admin.id,
            action: 'voucher_updated',
            resourceType: 'voucher',
            resourceId: updatedVoucher.id,
            newValues: { code: updatedVoucher.code, credits: updatedVoucher.credits },
            ipAddress: getClientIp(request),
            userAgent: getUserAgent(request),
        });

        return NextResponse.json({ success: true, data: { voucher: updatedVoucher } });
    } catch (error) {
        logger.error('Admin update voucher error', { error });
        if (error instanceof z.ZodError) {
            return NextResponse.json({ success: false, error: 'Invalid input', details: error.errors }, { status: 400 });
        }
        if (error instanceof Error && error.message === 'Authentication required') {
            return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
        }
        if (error instanceof Error && error.message === 'Super admin access required') {
            return NextResponse.json({ success: false, error: 'Super admin access required' }, { status: 403 });
        }
        if (error instanceof Error) {
            return NextResponse.json({ success: false, error: error.message }, { status: 400 });
        }
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
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
        const { id } = await context.params;

        const { data: voucher, error } = await supabase
            .from('vouchers')
            .delete()
            .eq('id', id)
            .select()
            .single();

        if (error) {
            logger.error('Failed to delete voucher', { error: error.message });
            return NextResponse.json({ success: false, error: 'Failed to delete voucher' }, { status: 500 });
        }

        await adminAuditService.logAdminAction({
            adminUserId: admin.id,
            action: 'voucher_deleted',
            resourceType: 'voucher',
            resourceId: id,
            oldValues: voucher ? { code: voucher.code, credits: voucher.credits } : undefined,
            ipAddress: getClientIp(request),
            userAgent: getUserAgent(request),
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error('Admin delete voucher error', { error });
        if (error instanceof Error && error.message === 'Authentication required') {
            return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
        }
        if (error instanceof Error && error.message === 'Super admin access required') {
            return NextResponse.json({ success: false, error: 'Super admin access required' }, { status: 403 });
        }
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
