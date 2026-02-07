import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/services/auth.service';
import { logger } from '@/lib/logger';
import { ValidationError, AppError } from '@/lib/errors';
import { setSessionCookie } from '@/lib/session';
import { ZodError } from 'zod';

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        const body = await request.json();

        const user = await authService.signup(body);

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
        logger.error('Signup route error', error instanceof Error ? error : undefined);

        if (error instanceof ZodError) {
            return NextResponse.json(
                {
                    success: false,
                    error: error.errors[0]?.message || 'Validation failed',
                },
                { status: 400 }
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
