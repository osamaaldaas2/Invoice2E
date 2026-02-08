import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authorization';
import { adminUserService } from '@/services/admin';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';
import { PaginationSchema } from '@/lib/validators';
import { handleApiError } from '@/lib/api-helpers';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    let userId: string | undefined;
    try {
        const admin = await requireAdmin(request);
        const { id } = await context.params;
        userId = id;

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

        const { searchParams } = new URL(request.url);
        const pagination = PaginationSchema.safeParse({
            page: searchParams.get('page') ?? '1',
            limit: searchParams.get('limit') ?? '20',
        });
        if (!pagination.success) {
            return NextResponse.json(
                { success: false, error: 'Invalid pagination parameters' },
                { status: 400 }
            );
        }

        const { page, limit } = pagination.data;
        const { items, total } = await adminUserService.getUserTransactions(userId, page, limit);

        return NextResponse.json({
            success: true,
            data: {
                items,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit),
                }
            }
        });
    } catch (error) {
        return handleApiError(error, 'Admin user transactions error', {
            includeSuccess: true,
            message: 'Failed to fetch user transactions',
            extra: userId ? { userId } : undefined,
        });
    }
}

export async function OPTIONS(): Promise<NextResponse> {
    return NextResponse.json({}, { status: 200 });
}
