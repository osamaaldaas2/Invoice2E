import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/session';
import { logger } from '@/lib/logger';
import { handleApiError } from '@/lib/api-helpers';

export async function POST(): Promise<NextResponse> {
    try {
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
