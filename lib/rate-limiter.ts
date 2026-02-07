/**
 * Rate Limiter with Redis (Upstash) support
 * Falls back to in-memory when Redis is not configured
 * 
 * To enable Redis:
 * 1. Create account at https://upstash.com
 * 2. Create a Redis database
 * 3. Add to .env.local:
 *    UPSTASH_REDIS_REST_URL=your_url
 *    UPSTASH_REDIS_REST_TOKEN=your_token
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { logger } from '@/lib/logger';

// Rate limit configurations for different endpoints
export const RATE_LIMIT_PRESETS = {
    login: {
        maxAttempts: 5,
        windowMs: 15 * 60 * 1000,      // 15 minutes
        blockDurationMs: 15 * 60 * 1000, // 15 minutes
    },
    api: {
        maxAttempts: 100,
        windowMs: 60 * 1000,            // 1 minute
        blockDurationMs: 60 * 1000,     // 1 minute
    },
    upload: {
        maxAttempts: 10,
        windowMs: 60 * 1000,            // 1 minute
        blockDurationMs: 5 * 60 * 1000, // 5 minutes
    },
    convert: {
        maxAttempts: 20,
        windowMs: 60 * 1000,            // 1 minute
        blockDurationMs: 2 * 60 * 1000, // 2 minutes
    },
    extract: {
        maxAttempts: 10,
        windowMs: 60 * 1000,            // 1 minute
        blockDurationMs: 2 * 60 * 1000, // 2 minutes
    },
    bulk: {
        maxAttempts: 5,
        windowMs: 60 * 1000,            // 1 minute
        blockDurationMs: 5 * 60 * 1000, // 5 minutes
    },
    admin: {
        maxAttempts: 100,
        windowMs: 60 * 1000,            // 1 minute
        blockDurationMs: 60 * 1000,     // 1 minute
    },
};

// Check if Redis is configured
const isRedisConfigured = !!(
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
);

// Create Redis client if configured
let redis: Redis | null = null;
let redisRateLimiters: Record<string, Ratelimit> | null = null;

if (isRedisConfigured) {
    try {
        redis = new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL!,
            token: process.env.UPSTASH_REDIS_REST_TOKEN!,
        });

        // Create rate limiters for each preset
        redisRateLimiters = {
            login: new Ratelimit({
                redis,
                limiter: Ratelimit.slidingWindow(5, '15 m'),
                analytics: true,
                prefix: 'ratelimit:login',
            }),
            api: new Ratelimit({
                redis,
                limiter: Ratelimit.slidingWindow(100, '1 m'),
                analytics: true,
                prefix: 'ratelimit:api',
            }),
            upload: new Ratelimit({
                redis,
                limiter: Ratelimit.slidingWindow(10, '1 m'),
                analytics: true,
                prefix: 'ratelimit:upload',
            }),
            convert: new Ratelimit({
                redis,
                limiter: Ratelimit.slidingWindow(20, '1 m'),
                analytics: true,
                prefix: 'ratelimit:convert',
            }),
        };

        logger.info('Redis rate limiter initialized (Upstash)');
    } catch (error) {
        logger.error('Failed to initialize Redis rate limiter', { error });
        redis = null;
        redisRateLimiters = null;
    }
} else {
    logger.info('Redis not configured, using in-memory rate limiter');
}

// ============================================
// In-memory fallback (for development/testing)
// ============================================

interface RateLimitEntry {
    attempts: number;
    firstAttempt: number;
    blockedUntil: number | null;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up old entries periodically (every 5 minutes)
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
        if (now - entry.firstAttempt > 60 * 60 * 1000) {
            rateLimitStore.delete(key);
        }
    }
}, 5 * 60 * 1000);

// ============================================
// Main Rate Limit Functions
// ============================================

export type RateLimitPreset = keyof typeof RATE_LIMIT_PRESETS;

/**
 * Check if a request should be rate limited
 */
export async function checkRateLimitAsync(
    identifier: string,
    preset: RateLimitPreset = 'api'
): Promise<{
    allowed: boolean;
    remainingAttempts: number;
    resetInSeconds: number;
    blockedForSeconds?: number;
}> {
    // Use Redis if available
    if (redisRateLimiters && redisRateLimiters[preset]) {
        try {
            const result = await redisRateLimiters[preset].limit(identifier);

            if (!result.success) {
                const blockedForSeconds = Math.ceil((result.reset - Date.now()) / 1000);
                logger.warn('Rate limit (Redis): Request blocked', {
                    identifier,
                    preset,
                    blockedForSeconds
                });
                return {
                    allowed: false,
                    remainingAttempts: result.remaining,
                    resetInSeconds: blockedForSeconds,
                    blockedForSeconds,
                };
            }

            return {
                allowed: true,
                remainingAttempts: result.remaining,
                resetInSeconds: Math.ceil((result.reset - Date.now()) / 1000),
            };
        } catch (error) {
            logger.error('Redis rate limit error, falling back to in-memory', { error });
            // Fall through to in-memory
        }
    }

    // Fallback to in-memory
    return checkRateLimitInMemory(identifier, preset);
}

/**
 * Synchronous check (for backward compatibility)
 * Uses in-memory store only
 */
export function checkRateLimit(identifier: string): {
    allowed: boolean;
    remainingAttempts: number;
    resetInSeconds: number;
    blockedForSeconds?: number;
} {
    return checkRateLimitInMemory(identifier, 'login');
}

/**
 * In-memory rate limit check
 */
function checkRateLimitInMemory(
    identifier: string,
    preset: RateLimitPreset
): {
    allowed: boolean;
    remainingAttempts: number;
    resetInSeconds: number;
    blockedForSeconds?: number;
} {
    const config = RATE_LIMIT_PRESETS[preset];
    const now = Date.now();
    let entry = rateLimitStore.get(identifier);

    // Check if currently blocked
    if (entry?.blockedUntil && now < entry.blockedUntil) {
        const blockedForSeconds = Math.ceil((entry.blockedUntil - now) / 1000);
        logger.warn('Rate limit (memory): Request blocked', { identifier, blockedForSeconds });
        return {
            allowed: false,
            remainingAttempts: 0,
            resetInSeconds: blockedForSeconds,
            blockedForSeconds,
        };
    }

    // Initialize or reset if window expired
    if (!entry || (now - entry.firstAttempt > config.windowMs)) {
        entry = {
            attempts: 0,
            firstAttempt: now,
            blockedUntil: null,
        };
    }

    // Increment attempt counter
    entry.attempts++;

    // Check if limit exceeded
    if (entry.attempts > config.maxAttempts) {
        entry.blockedUntil = now + config.blockDurationMs;
        rateLimitStore.set(identifier, entry);

        const blockedForSeconds = Math.ceil(config.blockDurationMs / 1000);
        logger.warn('Rate limit (memory): Too many attempts, blocking', {
            identifier,
            preset,
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

    const remainingAttempts = config.maxAttempts - entry.attempts;
    const resetInSeconds = Math.ceil((entry.firstAttempt + config.windowMs - now) / 1000);

    return {
        allowed: true,
        remainingAttempts,
        resetInSeconds,
    };
}

/**
 * Reset rate limit for an identifier
 */
export async function resetRateLimit(identifier: string): Promise<void> {
    // Clear from in-memory
    rateLimitStore.delete(identifier);

    // Reset in Redis for all presets if available
    if (redisRateLimiters) {
        try {
            const presetNames = Object.keys(RATE_LIMIT_PRESETS);
            await Promise.all(
                presetNames.map(preset =>
                    redisRateLimiters![preset as RateLimitPreset].resetUsedTokens(identifier)
                )
            );
        } catch (error) {
            logger.error('Failed to reset Redis rate limit', { error, identifier });
        }
    }
}

/**
 * Get identifier from request (IP address)
 */
export function getRequestIdentifier(request: Request, email?: string): string {
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const cfConnectingIp = request.headers.get('cf-connecting-ip');

    let ip = cfConnectingIp || realIp || forwardedFor?.split(',')[0]?.trim() || 'unknown';

    if (email) {
        return `login:${ip}:${email.toLowerCase()}`;
    }

    return `ip:${ip}`;
}

/**
 * Check if Redis is being used
 */
export function isUsingRedis(): boolean {
    return !!redisRateLimiters;
}

