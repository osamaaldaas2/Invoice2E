/**
 * CSRF Protection using Double-Submit Cookie Pattern
 * 
 * How it works:
 * 1. On login/signup, a CSRF token is generated and set as a cookie
 * 2. The client reads the cookie and sends the token in the X-CSRF-Token header
 * 3. Server validates that the header matches the signed cookie value
 * 
 * The cookie is NOT httpOnly so the client JS can read it.
 * The token is HMAC-signed so it can't be forged.
 */

import crypto from 'crypto';
import { cookies } from 'next/headers';
import { logger } from '@/lib/logger';

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_TOKEN_VERSION = 'c1';

function getCsrfSecret(): string {
    const secret = process.env.SESSION_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('CRITICAL: SESSION_SECRET must be set in production');
        }
        return crypto.createHash('sha256').update('INVOICE2E_DEV_CSRF_SECRET').digest('hex');
    }
    // Derive a separate key for CSRF to avoid key reuse
    return crypto.createHash('sha256').update(`csrf:${secret}`).digest('hex');
}

/**
 * Generate a signed CSRF token
 * Format: version.nonce.signature
 */
export function generateCsrfToken(): string {
    const nonce = crypto.randomBytes(16).toString('base64url');
    const dataToSign = `${CSRF_TOKEN_VERSION}.${nonce}`;
    const signature = crypto
        .createHmac('sha256', getCsrfSecret())
        .update(dataToSign)
        .digest('base64url');
    return `${dataToSign}.${signature}`;
}

/**
 * Verify a CSRF token's signature
 */
export function verifyCsrfToken(token: string): boolean {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return false;

        const [version, nonce, providedSignature] = parts;
        if (!version || !nonce || !providedSignature) return false;
        if (version !== CSRF_TOKEN_VERSION) return false;

        const dataToSign = `${version}.${nonce}`;
        const expectedSignature = crypto
            .createHmac('sha256', getCsrfSecret())
            .update(dataToSign)
            .digest('base64url');

        const sigBuffer = Buffer.from(providedSignature, 'base64url');
        const expectedBuffer = Buffer.from(expectedSignature, 'base64url');

        if (sigBuffer.length !== expectedBuffer.length) return false;
        return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
    } catch {
        return false;
    }
}

/**
 * Set CSRF cookie (call after login/signup)
 * The cookie is NOT httpOnly so client JS can read it for the header.
 */
export async function setCsrfCookie(): Promise<string> {
    const token = generateCsrfToken();
    const cookieStore = await cookies();
    cookieStore.set(CSRF_COOKIE_NAME, token, {
        httpOnly: false, // Client needs to read this
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 1 week, matches session
        path: '/',
    });
    return token;
}

/**
 * Clear CSRF cookie (call on logout)
 */
export async function clearCsrfCookie(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.set(CSRF_COOKIE_NAME, '', {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
    });
}

/**
 * Validate CSRF token from request.
 * Compares the cookie value with the header value.
 * Both must be present, match, and have a valid signature.
 * 
 * Returns true if valid, false if invalid.
 */
export async function validateCsrfToken(request: Request): Promise<boolean> {
    try {
        // Get token from header
        const headerToken = request.headers.get(CSRF_HEADER_NAME);
        if (!headerToken) {
            logger.warn('CSRF validation failed: missing header');
            return false;
        }

        // Get token from cookie
        const cookieStore = await cookies();
        const cookieToken = cookieStore.get(CSRF_COOKIE_NAME)?.value;
        if (!cookieToken) {
            logger.warn('CSRF validation failed: missing cookie');
            return false;
        }

        // Tokens must match (double-submit pattern)
        if (headerToken !== cookieToken) {
            logger.warn('CSRF validation failed: token mismatch');
            return false;
        }

        // Verify the token signature is valid
        if (!verifyCsrfToken(headerToken)) {
            logger.warn('CSRF validation failed: invalid signature');
            return false;
        }

        return true;
    } catch (error) {
        logger.error('CSRF validation error', { error });
        return false;
    }
}

/**
 * Helper: validate CSRF and return 403 response if invalid.
 * Returns null if valid, NextResponse if invalid.
 */
/**
 * Helper: validate CSRF and return 403 response if invalid.
 * Returns null if valid (or if CSRF enforcement is disabled), NextResponse if invalid.
 * 
 * CSRF enforcement is controlled by CSRF_ENFORCE env var.
 * When not enforced, logs a warning but allows the request through.
 * This allows gradual rollout — enable once the frontend sends X-CSRF-Token headers.
 */
export async function requireCsrfToken(request: Request): Promise<Response | null> {
    const enforce = process.env.CSRF_ENFORCE === 'true';
    const valid = await validateCsrfToken(request);

    if (!valid) {
        if (enforce) {
            const { NextResponse } = await import('next/server');
            return NextResponse.json(
                { success: false, error: 'Invalid or missing CSRF token' },
                { status: 403 }
            );
        }
        // Non-enforcing mode: log but allow through
        // Enable enforcement by setting CSRF_ENFORCE=true in .env.local
        return null;
    }
    return null;
}
