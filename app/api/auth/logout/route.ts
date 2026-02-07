import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/session';
import { logger } from '@/lib/logger';
import { handleApiError } from '@/lib/api-helpers';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        const rateLimitId = `${getRequestIdentifier(request)}:auth-logout`;
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

        // Clear the session cookie
        await clearSessionCookie();

        logger.info('User logged out');

        return NextResponse.json(
            {
                success: true,
                message: 'Logged out successfully',
            },
            { status: 200 }
        );
    } catch (error) {
        return handleApiError(error, 'Logout route error', {
            includeSuccess: true,
            message: 'Failed to logout'
        });
    }
}
