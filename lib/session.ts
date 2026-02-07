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

// Get session secret from environment or generate a warning
function getSessionSecret(): string {
    const secret = process.env.SESSION_SECRET;
    if (!secret) {
        // SECURITY: Fail hard in production if SESSION_SECRET is not set
        if (process.env.NODE_ENV === 'production') {
            throw new Error(
                'CRITICAL: SESSION_SECRET environment variable must be set in production. Generate one with: openssl rand -hex 32'
            );
        }
        logger.warn('SESSION_SECRET not set - using fallback for development only');
        const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY || 'DEV_ONLY_INSECURE_KEY';
        return crypto.createHash('sha256').update(fallback).digest('hex');
    }
    return secret;
}

// User role type for admin system
export type UserRole = 'user' | 'admin' | 'super_admin';

interface SessionPayload {
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
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
    const payload: SessionPayload = {
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role || 'user',
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
            logger.warn('Invalid session token format');
            return null;
        }

        const version = parts[0] ?? '';
        const payloadBase64 = parts[1] ?? '';
        const providedSignature = parts[2] ?? '';

        if (!version || !payloadBase64 || !providedSignature) {
            logger.warn('Invalid session token parts');
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

        return verifySessionToken(token);
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
