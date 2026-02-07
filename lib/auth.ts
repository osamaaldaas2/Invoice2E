import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { getSessionFromCookie } from '@/lib/session';

export interface AuthenticatedUser {
    id: string;
    email?: string;
    firstName?: string;
    lastName?: string;
}

/**
 * Get authenticated user from request
 * Uses HMAC-signed session tokens for secure authentication
 *
 * SECURITY FIX (BUG-010): Replaced unsafe plain-text cookie with
 * cryptographically signed session tokens that cannot be tampered with.
 *
 * The session token contains user ID + timestamp + HMAC signature.
 * Tampering with any part invalidates the signature.
 */
export async function getAuthenticatedUser(req: NextRequest): Promise<AuthenticatedUser | null> {
    try {
        void req;
        // Get session from signed cookie token
        const session = await getSessionFromCookie();

        if (!session) {
            logger.debug('No valid session found');
            return null;
        }

        // Return authenticated user from verified session
        return {
            id: session.userId,
            email: session.email,
            firstName: session.firstName,
            lastName: session.lastName,
        };
    } catch (error) {
        logger.error('Error in getAuthenticatedUser', { error });
        return null;
    }
}
