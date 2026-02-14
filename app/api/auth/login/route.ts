import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { handleApiError } from '@/lib/api-helpers';
import { logger } from '@/lib/logger';
import { LOCALE_COOKIE_NAME, DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@/lib/constants';
import { checkRateLimitAsync, getRequestIdentifier, resetRateLimit } from '@/lib/rate-limiter';
import { setSessionCookie } from '@/lib/session';
import { setCsrfCookie } from '@/lib/csrf';
import { LoginSchema } from '@/lib/validators';
import { authService } from '@/services/auth.service';

export async function POST(request: NextRequest): Promise<NextResponse> {
    // FIX (BUG-019): Rate limiting to prevent brute force attacks
    let rateLimitId: string | undefined;

    try {
        const body = await request.json();
        const validationResult = LoginSchema.safeParse(body);
        if (!validationResult.success) {
            const message = validationResult.error.errors[0]?.message || 'Invalid login data';
            return NextResponse.json({ success: false, error: message }, { status: 400 });
        }
        const validatedData = validationResult.data;
        const email = validatedData.email.toLowerCase();
        const loginInput = { ...validatedData, email };

        // Check rate limit before processing
        rateLimitId = getRequestIdentifier(request, email);
        const rateLimit = await checkRateLimitAsync(rateLimitId, 'login');

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
        await resetRateLimit(rateLimitId);

        // SECURITY FIX: Use signed session token instead of plain user ID
        await setSessionCookie(user);

        // Set CSRF token cookie for double-submit pattern
        await setCsrfCookie();

        // Set locale cookie from user's language preference
        const userLocale = SUPPORTED_LOCALES.includes(user.language as 'en' | 'de')
            ? user.language
            : DEFAULT_LOCALE;
        const cookieStore = await cookies();
        cookieStore.set(LOCALE_COOKIE_NAME, userLocale, {
            path: '/',
            maxAge: 60 * 60 * 24 * 365,
            sameSite: 'lax',
        });

        return NextResponse.json(
            {
                success: true,
                data: user,
                message: 'Logged in successfully',
            },
            { status: 200 }
        );
    } catch (error) {
        return handleApiError(error, 'Login route error', { includeSuccess: true });
    }
}
