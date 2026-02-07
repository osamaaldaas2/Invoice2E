import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock environment
vi.stubEnv('CORS_ALLOWED_ORIGINS', 'http://localhost:3000,https://example.com');

import { getCorsHeaders, isAllowedOrigin, handleCorsPreflightRequest } from '@/lib/cors';

describe('CORS', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('isAllowedOrigin', () => {
        it('should allow configured origins', () => {
            expect(isAllowedOrigin('http://localhost:3000')).toBe(true);
            expect(isAllowedOrigin('https://example.com')).toBe(true);
        });

        it('should reject unknown origins', () => {
            expect(isAllowedOrigin('https://malicious.com')).toBe(false);
        });

        it('should handle null origin', () => {
            expect(isAllowedOrigin(null)).toBe(false);
        });

        it('should handle undefined origin', () => {
            expect(isAllowedOrigin(undefined)).toBe(false);
        });
    });

    describe('getCorsHeaders', () => {
        it('should return CORS headers for allowed origin', () => {
            const headers = getCorsHeaders('http://localhost:3000');

            expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:3000');
            expect(headers['Access-Control-Allow-Methods']).toBeDefined();
            expect(headers['Access-Control-Allow-Headers']).toBeDefined();
        });

        it('should not include origin for disallowed origin', () => {
            const headers = getCorsHeaders('https://malicious.com');

            expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
        });
    });

    describe('handleCorsPreflightRequest', () => {
        it('should return 200 for valid preflight', () => {
            const response = handleCorsPreflightRequest('http://localhost:3000');

            expect(response.status).toBe(200);
        });

        it('should return 403 for invalid origin', () => {
            const response = handleCorsPreflightRequest('https://malicious.com');

            expect(response.status).toBe(403);
        });
    });
});
