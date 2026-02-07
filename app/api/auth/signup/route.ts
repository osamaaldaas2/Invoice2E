import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/services/auth.service';
import { logger } from '@/lib/logger';
import { setSessionCookie } from '@/lib/session';
import { ZodError } from 'zod';
import { SignupSchema } from '@/lib/validators';
import { handleApiError } from '@/lib/api-helpers';

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        const body = await request.json();
        const validatedData = SignupSchema.parse(body);
        const signupInput = { ...validatedData, email: validatedData.email.toLowerCase() };

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
        const extra = error instanceof ZodError ? { details: error.errors } : undefined;
        return handleApiError(error, 'Signup route error', {
            includeSuccess: true,
            extra
        });
    }
}
