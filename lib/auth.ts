import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { verifySessionToken, fetchSessionProfile } from '@/lib/session';

// FIX: Re-audit #11 — session cookie name must match lib/session.ts
const SESSION_COOKIE_NAME = 'session_token';

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
 * FIX: Re-audit #11 — read session cookie from the actual request object
 * instead of relying on next/headers cookies(). This makes the function
 * explicitly request-scoped and testable without Next.js async context.
 */
export async function getAuthenticatedUser(req: NextRequest): Promise<AuthenticatedUser | null> {
  try {
    // FIX: Re-audit #11 — extract session token from the request cookie directly
    const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;

    if (!token) {
      logger.debug('No session cookie found in request');
      return null;
    }

    const session = verifySessionToken(token);

    if (!session) {
      logger.debug('Invalid or expired session token');
      return null;
    }

    // FIX: Audit #011 — fetch PII from DB if not in token (new tokens omit PII)
    let email = session.email;
    let firstName = session.firstName;
    let lastName = session.lastName;
    if (!email) {
      const profile = await fetchSessionProfile(session.userId);
      email = profile.email;
      firstName = profile.firstName;
      lastName = profile.lastName;
    }

    return {
      id: session.userId,
      email,
      firstName,
      lastName,
    };
  } catch (error) {
    logger.error('Error in getAuthenticatedUser', { error });
    return null;
  }
}
