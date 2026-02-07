import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getAuthenticatedUser } from '@/lib/auth';
import { getSessionFromCookie, setSessionCookie } from '@/lib/session';
import { UpdateProfileSchema } from '@/lib/validators';
import { logger } from '@/lib/logger';
import { AppError, ValidationError } from '@/lib/errors';
import { userService } from '@/services/user.service';

export async function GET(request: NextRequest) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const profile = await userService.getProfile(user.id);
        return NextResponse.json({ success: true, data: profile }, { status: 200 });
    } catch (error) {
        logger.error('Failed to get profile', { error });
        return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const validated = UpdateProfileSchema.parse(body);
        const profile = await userService.updateProfile(user.id, validated);
        const session = await getSessionFromCookie();

        if (session) {
            await setSessionCookie({
                id: user.id,
                email: profile.email ?? session.email,
                firstName: profile.firstName ?? session.firstName,
                lastName: profile.lastName ?? session.lastName,
                role: session.role,
            });
        }

        return NextResponse.json({ success: true, data: profile }, { status: 200 });
    } catch (error) {
        logger.error('Failed to update profile', { error });

        if (error instanceof ZodError) {
            return NextResponse.json(
                { error: error.errors[0]?.message || 'Validation failed' },
                { status: 400 }
            );
        }

        if (error instanceof ValidationError || error instanceof AppError) {
            return NextResponse.json({ error: error.message }, { status: error.statusCode });
        }

        return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }
}
