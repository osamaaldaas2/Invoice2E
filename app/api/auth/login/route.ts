import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/services/auth.service';
import { logger } from '@/lib/logger';
import { ZodError } from 'zod';
import { setSessionCookie } from '@/lib/session';
import { checkRateLimit, resetRateLimit, getRequestIdentifier } from '@/lib/rate-limiter';
import { LoginSchema } from '@/lib/validators';
import { handleApiError } from '@/lib/api-helpers';

export async function POST(request: NextRequest): Promise<NextResponse> {
    // FIX (BUG-019): Rate limiting to prevent brute force attacks
    let rateLimitId: string | undefined;

    try {
        const body = await request.json();
        const validatedData = LoginSchema.parse(body);
        const email = validatedData.email.toLowerCase();
        const loginInput = { ...validatedData, email };

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

        const user = await authService.login(loginInput);

        logger.info('Login successful', { userId: user.id });

        // Reset rate limit on successful login
        resetRateLimit(rateLimitId);

        // SECURITY FIX: Use signed session token instead of plain user ID
        await setSessionCookie(user);

        return NextResponse.json(
            {
                success: true,
                data: user,
                message: 'Logged in successfully',
            },
            { status: 200 }
        );
    } catch (error) {
        const extra = error instanceof ZodError ? { details: error.errors } : undefined;
        return handleApiError(error, 'Login route error', {
            includeSuccess: true,
            extra
        });
    }
}
