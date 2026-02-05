import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/session';
import { logger } from '@/lib/logger';

export async function POST(): Promise<NextResponse> {
    try {
        // Clear the session cookie
        clearSessionCookie();

        logger.info('User logged out');

        return NextResponse.json(
            {
                success: true,
                message: 'Logged out successfully',
            },
            { status: 200 }
        );
    } catch (error) {
        logger.error('Logout route error', { error });

        return NextResponse.json(
            {
                success: false,
                error: 'Failed to logout',
            },
            { status: 500 }
        );
    }
}
