import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-helpers';
import { logger } from '@/lib/logger';
import { setSessionCookie } from '@/lib/session';
import { SignupSchema } from '@/lib/validators';
import { authService } from '@/services/auth.service';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        const body = await request.json();
        const validationResult = SignupSchema.safeParse(body);
        if (!validationResult.success) {
            const message = validationResult.error.errors[0]?.message || 'Invalid signup data';
            return NextResponse.json({ success: false, error: message }, { status: 400 });
        }
        const validatedData = validationResult.data;
        const signupInput = { ...validatedData, email: validatedData.email.toLowerCase() };

        const rateLimitId = `${getRequestIdentifier(request, signupInput.email)}:auth-signup`;
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

        const user = await authService.signup(signupInput);

        logger.info('Signup successful', { userId: user.id });

        // Set session cookie so backend recognizes the new user as logged in
        await setSessionCookie(user);

        return NextResponse.json(
            {
                success: true,
                data: user,
                message: 'Account created successfully',
            },
            { status: 201 }
        );
    } catch (error) {
        return handleApiError(error, 'Signup route error', { includeSuccess: true });
    }
}
