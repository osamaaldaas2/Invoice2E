import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
    checkRateLimit,
    getRequestIdentifier,
    resetRateLimit,
    RATE_LIMIT_PRESETS
} from '@/lib/rate-limiter';

describe('Rate Limiter', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        // Reset rate limiter state between tests
        await resetRateLimit('test-id');
    });

    describe('RATE_LIMIT_PRESETS', () => {
        it('should have login preset', () => {
            expect(RATE_LIMIT_PRESETS.login).toBeDefined();
            expect(RATE_LIMIT_PRESETS.login.maxAttempts).toBeDefined();
            expect(RATE_LIMIT_PRESETS.login.windowMs).toBeDefined();
            expect(RATE_LIMIT_PRESETS.login.blockDurationMs).toBeDefined();
        });

        it('should have api preset', () => {
            expect(RATE_LIMIT_PRESETS.api).toBeDefined();
        });

        it('should have upload preset', () => {
            expect(RATE_LIMIT_PRESETS.upload).toBeDefined();
        });
    });

    describe('checkRateLimit', () => {
        it('should allow first request', () => {
            const result = checkRateLimit('unique-test-id-1');

            expect(result.allowed).toBe(true);
            expect(result.remainingAttempts).toBeTypeOf('number');
            expect(result.resetInSeconds).toBeTypeOf('number');
        });

        it('should track remaining requests', () => {
            const id = 'unique-test-id-2';
            const result1 = checkRateLimit(id);
            const result2 = checkRateLimit(id);

            expect(result1.allowed).toBe(true);
            expect(result2.remainingAttempts).toBeLessThan(result1.remainingAttempts);
        });

        it('should block after limit exceeded', () => {
            const id = 'spam-test-id';

            // Login preset allows 5 attempts before blocking
            for (let i = 0; i < 6; i++) {
                checkRateLimit(id);
            }

            const result = checkRateLimit(id);
            expect(result.allowed).toBe(false);
            expect(result.remainingAttempts).toBe(0);
            expect(result.blockedForSeconds).toBeGreaterThan(0);
        });
    });

    describe('resetRateLimit', () => {
        it('should reset rate limit for identifier', async () => {
            const id = 'reset-test-id';

            // Use some requests
            checkRateLimit(id);
            checkRateLimit(id);

            // Reset
            await resetRateLimit(id);

            // Should have full limit again
            const result = checkRateLimit(id);
            expect(result.allowed).toBe(true);
            expect(result.remainingAttempts).toBe(RATE_LIMIT_PRESETS.login.maxAttempts - 1);
        });
    });

    describe('getRequestIdentifier', () => {
        it('should generate identifier from IP', () => {
            // FIX-002: Use cf-connecting-ip (trusted header) instead of x-forwarded-for
            const request = {
                headers: {
                    get: (name: string) => {
                        if (name === 'cf-connecting-ip') return '192.168.1.1';
                        return null;
                    },
                },
                ip: undefined,
            } as any;

            const id = getRequestIdentifier(request);
            expect(id).toContain('192.168.1.1');
        });

        it('should include email when provided', () => {
            const request = {
                headers: {
                    get: () => null,
                },
                ip: '10.0.0.1',
            } as any;

            const id = getRequestIdentifier(request, 'user@example.com');
            expect(id).toContain('user@example.com');
        });
    });
});
