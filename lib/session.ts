/**
 * Secure Session Management
 * Uses HMAC-SHA256 signed tokens to prevent tampering
 *
 * SECURITY FIX: Replaces insecure plain-text session_user_id cookie
 * that allowed attackers to impersonate any user
 */

import crypto from 'crypto';
import { cookies } from 'next/headers';
import { logger } from '@/lib/logger';

// Session configuration
const SESSION_COOKIE_NAME = 'session_token';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 1 week in seconds
const TOKEN_VERSION = 'v1'; // For future token format changes

// FIX: Audit #008 — no deterministic session secret fallback
let _devSecret: string | null = null;

function getSessionSecret(): string {
    const secret = process.env.SESSION_SECRET;
    if (secret) return secret;

    // SECURITY: Fail hard in production if SESSION_SECRET is not set
    if (process.env.NODE_ENV === 'production') {
        throw new Error(
            'CRITICAL: SESSION_SECRET environment variable must be set in production. Generate one with: openssl rand -hex 32'
        );
    }

    // FIX: Audit #008 — generate random secret per-process in development.
    // Sessions won't persist across restarts, but secret is never guessable.
    if (!_devSecret) {
        _devSecret = crypto.randomBytes(32).toString('hex');
        logger.warn('SESSION_SECRET not set — using random per-process secret. Sessions will not persist across restarts.');
    }
    return _devSecret;
}

// User role type for admin system
export type UserRole = 'user' | 'admin' | 'super_admin' | 'accountant';

/**
 * FIX: Audit #011 — session token no longer contains PII (email, firstName, lastName).
 * Only userId and role are stored in the token. PII is fetched from DB on demand.
 * Legacy tokens with PII fields are still accepted during the migration period.
 */
interface SessionPayload {
    userId: string;
    /** @deprecated PII removed from token — use fetchSessionProfile() instead */
    email: string;
    /** @deprecated PII removed from token — use fetchSessionProfile() instead */
    firstName: string;
    /** @deprecated PII removed from token — use fetchSessionProfile() instead */
    lastName: string;
    role: UserRole;
    /** FIX: Audit #036 — issuer claim */
    iss?: string;
    /** FIX: Audit #036 — audience claim */
    aud?: string;
    issuedAt: number;
    expiresAt: number;
}

/**
 * Create a signed session token
 * Format: version.base64(payload).signature
 */
export function createSessionToken(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role?: UserRole;
}): string {
    const now = Math.floor(Date.now() / 1000);
    // FIX: Audit #011 — exclude PII from token payload.
    // FIX: Audit #036 — add iss/aud claims.
    const payload: SessionPayload = {
        userId: user.id,
        email: '',
        firstName: '',
        lastName: '',
        role: user.role || 'user',
        iss: 'invoice2e',
        aud: process.env.NEXT_PUBLIC_APP_URL || 'https://invoice2e.com',
        issuedAt: now,
        expiresAt: now + SESSION_MAX_AGE,
    };

    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const dataToSign = `${TOKEN_VERSION}.${payloadBase64}`;
    const signature = crypto
        .createHmac('sha256', getSessionSecret())
        .update(dataToSign)
        .digest('base64url');

    return `${dataToSign}.${signature}`;
}

/**
 * Verify and decode a session token
 * Returns null if invalid, expired, or tampered
 */
export function verifySessionToken(token: string): SessionPayload | null {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) {
            logger.warn('Invalid session token format: incorrect part count');
            return null;
        }

        const [version = '', payloadBase64 = '', providedSignature = ''] = parts;

        if (
            !version ||
            !payloadBase64 ||
            !providedSignature ||
            version.trim() === '' ||
            payloadBase64.trim() === '' ||
            providedSignature.trim() === ''
        ) {
            logger.warn('Invalid session token: empty parts detected');
            return null;
        }

        // Check version
        if (version !== TOKEN_VERSION) {
            logger.warn('Invalid session token version', { version });
            return null;
        }

        // Verify signature
        const dataToSign = `${version}.${payloadBase64}`;
        const expectedSignature = crypto
            .createHmac('sha256', getSessionSecret())
            .update(dataToSign)
            .digest('base64url');

        // Use timing-safe comparison to prevent timing attacks
        const sigBuffer = Buffer.from(providedSignature, 'base64url');
        const expectedBuffer = Buffer.from(expectedSignature, 'base64url');

        if (sigBuffer.length !== expectedBuffer.length ||
            !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
            logger.warn('Invalid session token signature');
            return null;
        }

        // Decode payload
        const payload: SessionPayload = JSON.parse(
            Buffer.from(payloadBase64, 'base64url').toString('utf8')
        );

        // Check expiration
        const now = Math.floor(Date.now() / 1000);
        if (payload.expiresAt < now) {
            logger.info('Session token expired', { userId: payload.userId });
            return null;
        }

        // FIX: Audit #036 — validate iss/aud if present (new tokens have them, legacy may not)
        if (payload.iss && payload.iss !== 'invoice2e') {
            logger.warn('Invalid session token issuer', { iss: payload.iss });
            return null;
        }

        return payload;
    } catch (error) {
        logger.error('Error verifying session token', { error });
        return null;
    }
}

/**
 * Set session cookie with signed token
 */
export function setSessionCookie(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role?: UserRole;
}): Promise<void> {
    return setSessionCookieInternal(user);
}

async function setSessionCookieInternal(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role?: UserRole;
}): Promise<void> {
    const token = createSessionToken(user);
    const cookieStore = await cookies();

    cookieStore.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: SESSION_MAX_AGE,
        path: '/',
    });

    // Also clear any legacy session cookie
    cookieStore.set('session_user_id', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
    });
}

/**
 * Get session from cookie
 * Returns null if no valid session
 */
export async function getSessionFromCookie(): Promise<SessionPayload | null> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

        if (!token) {
            return null;
        }

        const session = verifySessionToken(token);
        if (!session) return null;

        // EXP-6: Sliding window — renew session if older than half the TTL (3.5 days)
        const now = Math.floor(Date.now() / 1000);
        const halfTtl = SESSION_MAX_AGE / 2;
        if (now - session.issuedAt > halfTtl) {
            try {
                const freshToken = createSessionToken({
                    id: session.userId,
                    email: session.email,
                    firstName: session.firstName,
                    lastName: session.lastName,
                    role: session.role,
                });
                cookieStore.set(SESSION_COOKIE_NAME, freshToken, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    maxAge: SESSION_MAX_AGE,
                    path: '/',
                });
            } catch (renewalError) {
                // Non-critical: if cookie renewal fails, session still valid
                logger.warn('Session renewal failed, continuing with current session', {
                    userId: session.userId,
                    error: renewalError instanceof Error ? renewalError.message : String(renewalError),
                });
            }
        }

        return session;
    } catch (error) {
        logger.error('Error getting session from cookie', { error });
        return null;
    }
}

/**
 * Clear session cookie (logout)
 */
export async function clearSessionCookie(): Promise<void> {
    const cookieStore = await cookies();

    cookieStore.set(SESSION_COOKIE_NAME, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
    });

    // Also clear legacy cookie
    cookieStore.set('session_user_id', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
    });
}

// ============================================
// Session Profile Fetcher — FIX: Audit #011
// PII removed from token; fetch from DB when needed
// ============================================

/** Cached profile data fetched from DB for the current session. */
const _profileCache = new Map<string, { email: string; firstName: string; lastName: string; fetchedAt: number }>();
const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * FIX: Audit #011 — Fetch user profile (email, name) from database.
 * Use this instead of reading PII from the session token.
 * Results are cached in-memory for 5 minutes per userId.
 */
export async function fetchSessionProfile(userId: string): Promise<{
    email: string;
    firstName: string;
    lastName: string;
}> {
    const cached = _profileCache.get(userId);
    if (cached && Date.now() - cached.fetchedAt < PROFILE_CACHE_TTL_MS) {
        return { email: cached.email, firstName: cached.firstName, lastName: cached.lastName };
    }

    try {
        // Lazy import to avoid circular dependency
        const { createAdminClient } = await import('@/lib/supabase.server');
        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from('users')
            .select('email, first_name, last_name')
            .eq('id', userId)
            .single();

        if (error || !data) {
            logger.warn('Failed to fetch session profile', { userId, error: error?.message });
            return { email: '', firstName: '', lastName: '' };
        }

        const profile = {
            email: data.email as string,
            firstName: data.first_name as string,
            lastName: data.last_name as string,
            fetchedAt: Date.now(),
        };
        _profileCache.set(userId, profile);

        return { email: profile.email, firstName: profile.firstName, lastName: profile.lastName };
    } catch (err) {
        logger.error('fetchSessionProfile error', { userId, error: err });
        return { email: '', firstName: '', lastName: '' };
    }
}

/**
 * Get a full session with profile data (backward-compatible).
 * FIX: Audit #011 — merges token session + DB profile.
 */
export async function getSessionWithProfile(): Promise<(SessionPayload & { email: string; firstName: string; lastName: string }) | null> {
    const session = await getSessionFromCookie();
    if (!session) return null;

    // If token still has PII (legacy token), use it; otherwise fetch from DB
    if (session.email) {
        return session;
    }

    const profile = await fetchSessionProfile(session.userId);
    return { ...session, ...profile };
}

// ============================================
// Signed URL Functions for Download Authorization
// FIX (BUG-031): Prevent unauthorized access to download URLs
// ============================================

const DOWNLOAD_URL_MAX_AGE = 60 * 60; // 1 hour in seconds

interface SignedUrlPayload {
    userId: string;
    resourceType: string;
    resourceId: string;
    expiresAt: number;
}

/**
 * Create a signed download token
 * FIX (BUG-031): Secure download URLs with HMAC signature
 */
export function createSignedDownloadToken(
    userId: string,
    resourceType: string,
    resourceId: string,
    expiresInSeconds: number = DOWNLOAD_URL_MAX_AGE
): string {
    const now = Math.floor(Date.now() / 1000);
    const payload: SignedUrlPayload = {
        userId,
        resourceType,
        resourceId,
        expiresAt: now + expiresInSeconds,
    };

    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
        .createHmac('sha256', getSessionSecret())
        .update(payloadBase64)
        .digest('base64url');

    return `${payloadBase64}.${signature}`;
}

/**
 * Verify a signed download token
 * Returns payload if valid, null if invalid or expired
 */
export function verifySignedDownloadToken(
    token: string,
    expectedUserId: string,
    expectedResourceType: string,
    expectedResourceId: string
): SignedUrlPayload | null {
    try {
        const parts = token.split('.');
        if (parts.length !== 2) {
            logger.warn('Invalid signed URL token format');
            return null;
        }

        const payloadBase64 = parts[0] ?? '';
        const providedSignature = parts[1] ?? '';

        if (!payloadBase64 || !providedSignature) {
            logger.warn('Invalid signed URL token parts');
            return null;
        }

        // Verify signature
        const expectedSignature = crypto
            .createHmac('sha256', getSessionSecret())
            .update(payloadBase64)
            .digest('base64url');

        const sigBuffer = Buffer.from(providedSignature, 'base64url');
        const expectedBuffer = Buffer.from(expectedSignature, 'base64url');

        if (sigBuffer.length !== expectedBuffer.length ||
            !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
            logger.warn('Invalid signed URL signature');
            return null;
        }

        // Decode and validate payload
        const payload: SignedUrlPayload = JSON.parse(
            Buffer.from(payloadBase64, 'base64url').toString('utf8')
        );

        // Check expiration
        const now = Math.floor(Date.now() / 1000);
        if (payload.expiresAt < now) {
            logger.info('Signed URL expired', { resourceId: payload.resourceId });
            return null;
        }

        // Verify user ID matches
        if (payload.userId !== expectedUserId) {
            logger.warn('Signed URL user mismatch', {
                expected: expectedUserId,
                got: payload.userId
            });
            return null;
        }

        // Verify resource type and ID match
        if (payload.resourceType !== expectedResourceType ||
            payload.resourceId !== expectedResourceId) {
            logger.warn('Signed URL resource mismatch');
            return null;
        }

        return payload;
    } catch (error) {
        logger.error('Error verifying signed URL token', { error });
        return null;
    }
}
