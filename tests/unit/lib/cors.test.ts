import { describe, expect, it } from 'vitest';
import { isOriginAllowed, getCorsHeaders, CORS_CONFIG } from '@/lib/cors';

describe('CORS', () => {
    describe('CORS_CONFIG', () => {
        it('should have allowedMethods defined', () => {
            expect(CORS_CONFIG.allowedMethods).toBeDefined();
            expect(CORS_CONFIG.allowedMethods).toContain('GET');
            expect(CORS_CONFIG.allowedMethods).toContain('POST');
        });

        it('should have allowedHeaders defined', () => {
            expect(CORS_CONFIG.allowedHeaders).toBeDefined();
            expect(CORS_CONFIG.allowedHeaders).toContain('Content-Type');
            expect(CORS_CONFIG.allowedHeaders).toContain('Authorization');
        });

        it('should have maxAge defined', () => {
            expect(CORS_CONFIG.maxAge).toBe(86400);
        });

        it('should have credentials enabled', () => {
            expect(CORS_CONFIG.credentials).toBe(true);
        });
    });

    describe('isOriginAllowed', () => {
        it('should allow null origin (same-origin)', () => {
            expect(isOriginAllowed(null)).toBe(true);
        });

        it('should allow localhost in development', () => {
            // In test environment (not production), localhost should be allowed
            expect(isOriginAllowed('http://localhost:3000')).toBe(true);
        });
    });

    describe('getCorsHeaders', () => {
        it('should include methods header', () => {
            const headers = getCorsHeaders('http://localhost:3000');
            expect(headers['Access-Control-Allow-Methods']).toBeDefined();
        });

        it('should include headers header', () => {
            const headers = getCorsHeaders('http://localhost:3000');
            expect(headers['Access-Control-Allow-Headers']).toBeDefined();
        });

        it('should include max-age header', () => {
            const headers = getCorsHeaders('http://localhost:3000');
            expect(headers['Access-Control-Max-Age']).toBe('86400');
        });

        it('should include credentials header when enabled', () => {
            const headers = getCorsHeaders('http://localhost:3000');
            expect(headers['Access-Control-Allow-Credentials']).toBe('true');
        });

        it('should include Vary header', () => {
            const headers = getCorsHeaders('http://localhost:3000');
            expect(headers['Vary']).toBe('Origin');
        });

        it('should set origin for allowed origins', () => {
            const headers = getCorsHeaders('http://localhost:3000');
            // In non-production, localhost is allowed
            expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:3000');
        });
    });
});
