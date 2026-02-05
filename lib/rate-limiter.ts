/**
 * Simple in-memory rate limiter
 * FIX (BUG-019): Prevent brute force attacks on login endpoint
 *
 * For production, consider using Redis-based rate limiting
 * or a service like Cloudflare rate limiting.
 */

import { logger } from '@/lib/logger';

interface RateLimitEntry {
    attempts: number;
    firstAttempt: number;
    blockedUntil: number | null;
}

// In-memory store (cleared on server restart)
// For production, use Redis or similar
const rateLimitStore = new Map<string, RateLimitEntry>();

// Configuration
const LOGIN_MAX_ATTEMPTS = 5; // Max attempts before blocking
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes window
const LOGIN_BLOCK_DURATION_MS = 15 * 60 * 1000; // Block for 15 minutes

// Clean up old entries periodically (every 5 minutes)
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
        // Remove entries older than 1 hour
        if (now - entry.firstAttempt > 60 * 60 * 1000) {
            rateLimitStore.delete(key);
        }
    }
}, 5 * 60 * 1000);

/**
 * Check if a request should be rate limited
 * @param identifier - Unique identifier (e.g., IP address or IP:email combo)
 * @returns Object with allowed status and reset time
 */
export function checkRateLimit(identifier: string): {
    allowed: boolean;
    remainingAttempts: number;
    resetInSeconds: number;
    blockedForSeconds?: number;
} {
    const now = Date.now();
    let entry = rateLimitStore.get(identifier);

    // Check if currently blocked
    if (entry?.blockedUntil && now < entry.blockedUntil) {
        const blockedForSeconds = Math.ceil((entry.blockedUntil - now) / 1000);
        logger.warn('Rate limit: Request blocked', { identifier, blockedForSeconds });
        return {
            allowed: false,
            remainingAttempts: 0,
            resetInSeconds: blockedForSeconds,
            blockedForSeconds,
        };
    }

    // Initialize or reset if window expired
    if (!entry || (now - entry.firstAttempt > LOGIN_WINDOW_MS)) {
        entry = {
            attempts: 0,
            firstAttempt: now,
            blockedUntil: null,
        };
    }

    // Increment attempt counter
    entry.attempts++;

    // Check if limit exceeded
    if (entry.attempts > LOGIN_MAX_ATTEMPTS) {
        entry.blockedUntil = now + LOGIN_BLOCK_DURATION_MS;
        rateLimitStore.set(identifier, entry);

        const blockedForSeconds = Math.ceil(LOGIN_BLOCK_DURATION_MS / 1000);
        logger.warn('Rate limit: Too many attempts, blocking', {
            identifier,
            attempts: entry.attempts,
            blockedForSeconds
        });

        return {
            allowed: false,
            remainingAttempts: 0,
            resetInSeconds: blockedForSeconds,
            blockedForSeconds,
        };
    }

    // Update store
    rateLimitStore.set(identifier, entry);

    const remainingAttempts = LOGIN_MAX_ATTEMPTS - entry.attempts;
    const resetInSeconds = Math.ceil((entry.firstAttempt + LOGIN_WINDOW_MS - now) / 1000);

    return {
        allowed: true,
        remainingAttempts,
        resetInSeconds,
    };
}

/**
 * Reset rate limit for an identifier (e.g., after successful login)
 */
export function resetRateLimit(identifier: string): void {
    rateLimitStore.delete(identifier);
}

/**
 * Get identifier from request (IP address)
 * Note: In production behind a proxy, use X-Forwarded-For header
 */
export function getRequestIdentifier(request: Request, email?: string): string {
    // Try to get real IP from common headers
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const cfConnectingIp = request.headers.get('cf-connecting-ip'); // Cloudflare

    let ip = cfConnectingIp || realIp || forwardedFor?.split(',')[0]?.trim() || 'unknown';

    // For login, combine IP with email to prevent blocking innocent users
    // who share an IP (e.g., corporate network)
    if (email) {
        return `login:${ip}:${email.toLowerCase()}`;
    }

    return `ip:${ip}`;
}
