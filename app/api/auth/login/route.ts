import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/services/auth.service';
import { logger } from '@/lib/logger';
import { ValidationError, AppError, UnauthorizedError, ForbiddenError } from '@/lib/errors';
import { ZodError } from 'zod';
import { setSessionCookie } from '@/lib/session';
import { checkRateLimit, resetRateLimit, getRequestIdentifier } from '@/lib/rate-limiter';

export async function POST(request: NextRequest): Promise<NextResponse> {
    // FIX (BUG-019): Rate limiting to prevent brute force attacks
    let rateLimitId: string | undefined;

    try {
        const body = await request.json();
        const email = body.email?.toLowerCase();

        // Check rate limit before processing
        rateLimitId = getRequestIdentifier(request, email);
        const rateLimit = checkRateLimit(rateLimitId);

        if (!rateLimit.allowed) {
            logger.warn('Login rate limited', { email, blockedForSeconds: rateLimit.blockedForSeconds });
            return NextResponse.json(
                {
                    success: false,
                    error: `Too many login attempts. Please try again in ${Math.ceil((rateLimit.blockedForSeconds || 900) / 60)} minutes.`,
                    retryAfter: rateLimit.resetInSeconds,
                },
                {
                    status: 429,
                    headers: {
                        'Retry-After': String(rateLimit.resetInSeconds),
                        'X-RateLimit-Remaining': '0',
                        'X-RateLimit-Reset': String(rateLimit.resetInSeconds),
                    }
                }
            );
        }

        const user = await authService.login(body);

        logger.info('Login successful', { userId: user.id });

        // Reset rate limit on successful login
        resetRateLimit(rateLimitId);

        // SECURITY FIX: Use signed session token instead of plain user ID
        setSessionCookie(user);

        return NextResponse.json(
            {
                success: true,
                data: user,
                message: 'Logged in successfully',
            },
            { status: 200 }
        );
    } catch (error) {
        logger.error('Login route error', error instanceof Error ? error : undefined);

        if (error instanceof ZodError) {
            return NextResponse.json(
                {
                    success: false,
                    error: error.errors[0]?.message || 'Validation failed',
                },
                { status: 400 }
            );
        }

        if (error instanceof UnauthorizedError) {
            // Don't reset rate limit on failed auth - this counts as an attempt
            return NextResponse.json(
                {
                    success: false,
                    error: error.message,
                },
                { status: 401 }
            );
        }

        if (error instanceof ForbiddenError) {
            // User is banned
            return NextResponse.json(
                {
                    success: false,
                    error: error.message,
                },
                { status: 403 }
            );
        }

        if (error instanceof ValidationError) {
            return NextResponse.json(
                {
                    success: false,
                    error: error.message,
                },
                { status: error.statusCode }
            );
        }

        if (error instanceof AppError) {
            return NextResponse.json(
                {
                    success: false,
                    error: error.message,
                },
                { status: error.statusCode }
            );
        }

        return NextResponse.json(
            {
                success: false,
                error: 'Internal server error',
            },
            { status: 500 }
        );
    }
}
