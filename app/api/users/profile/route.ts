import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getAuthenticatedUser } from '@/lib/auth';
import { getSessionFromCookie, setSessionCookie } from '@/lib/session';
import { UpdateProfileSchema } from '@/lib/validators';
import { AppError, ValidationError } from '@/lib/errors';
import { userService } from '@/services/user.service';
import { handleApiError } from '@/lib/api-helpers';

export async function GET(request: NextRequest) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const profile = await userService.getProfile(user.id);
        return NextResponse.json({ success: true, data: profile }, { status: 200 });
    } catch (error) {
        return handleApiError(error, 'Failed to get profile', {
            message: 'Failed to load profile',
        });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
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
        if (error instanceof ZodError) {
            return NextResponse.json(
                { success: false, error: error.errors[0]?.message || 'Validation failed' },
                { status: 400 }
            );
        }

        if (error instanceof ValidationError || error instanceof AppError) {
            return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
        }

        return handleApiError(error, 'Failed to update profile', {
            message: 'Failed to update profile',
        });
    }
}
