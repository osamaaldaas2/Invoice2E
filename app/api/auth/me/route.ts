import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/session';
import { logger } from '@/lib/logger';

/**
 * GET /api/auth/me
 * Returns current authenticated user from session
 * Used by ProtectedRoute to verify session validity
 *
 * FIX (BUG-036): Endpoint for frontend session validation
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
    try {
        const session = getSessionFromCookie();

        if (!session) {
            return NextResponse.json(
                { success: false, error: 'Not authenticated' },
                { status: 401 }
            );
        }

        // Session is valid - return user info including role
        return NextResponse.json({
            success: true,
            data: {
                id: session.userId,
                email: session.email,
                firstName: session.firstName,
                lastName: session.lastName,
                role: session.role || 'user',
            },
        });
    } catch (error) {
        logger.error('Auth me error', { error });
        return NextResponse.json(
            { success: false, error: 'Authentication check failed' },
            { status: 500 }
        );
    }
}
