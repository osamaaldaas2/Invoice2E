import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock NextRequest
const mockRequest = vi.hoisted(() => ({
    headers: {
        get: vi.fn(),
    },
    ip: undefined,
}));

import {
    checkRateLimit,
    getRequestIdentifier,
    resetRateLimit,
    RATE_LIMIT_PRESETS
} from '@/lib/rate-limiter';

describe('Rate Limiter', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset rate limiter state between tests
        resetRateLimit('test-id');
    });

    describe('RATE_LIMIT_PRESETS', () => {
        it('should have auth preset', () => {
            expect(RATE_LIMIT_PRESETS.auth).toBeDefined();
            expect(RATE_LIMIT_PRESETS.auth.limit).toBeDefined();
            expect(RATE_LIMIT_PRESETS.auth.windowInSeconds).toBeDefined();
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
        });

        it('should track remaining requests', () => {
            const id = 'unique-test-id-2';
            const result1 = checkRateLimit(id);
            const result2 = checkRateLimit(id);

            expect(result1.allowed).toBe(true);
            expect(result2.remaining).toBeLessThan(result1.remaining!);
        });

        it('should block after limit exceeded', () => {
            const id = 'spam-test-id';

            // Exhaust the limit
            for (let i = 0; i < 10; i++) {
                checkRateLimit(id, { limit: 5, windowInSeconds: 60 });
            }

            const result = checkRateLimit(id, { limit: 5, windowInSeconds: 60 });
            expect(result.allowed).toBe(false);
        });
    });

    describe('resetRateLimit', () => {
        it('should reset rate limit for identifier', () => {
            const id = 'reset-test-id';

            // Use some requests
            checkRateLimit(id, { limit: 3, windowInSeconds: 60 });
            checkRateLimit(id, { limit: 3, windowInSeconds: 60 });

            // Reset
            resetRateLimit(id);

            // Should have full limit again
            const result = checkRateLimit(id, { limit: 3, windowInSeconds: 60 });
            expect(result.allowed).toBe(true);
        });
    });

    describe('getRequestIdentifier', () => {
        it('should generate identifier from IP', () => {
            const request = {
                headers: {
                    get: (name: string) => {
                        if (name === 'x-forwarded-for') return '192.168.1.1';
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
