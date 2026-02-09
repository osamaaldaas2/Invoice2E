import { describe, it, expect, vi } from 'vitest';

// Mock next/headers before importing session module
vi.mock('next/headers', () => ({
    cookies: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

// Set a stable SESSION_SECRET for deterministic tests
process.env.SESSION_SECRET = 'test-secret-key-for-unit-tests-32chars!!';

import {
    createSessionToken,
    verifySessionToken,
    createSignedDownloadToken,
    verifySignedDownloadToken,
} from '@/lib/session';

describe('Session Token', () => {
    const testUser = {
        id: 'user-123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'user' as const,
    };

    describe('createSessionToken', () => {
        it('should create a token with 3 parts (version.payload.signature)', () => {
            const token = createSessionToken(testUser);
            const parts = token.split('.');
            expect(parts.length).toBe(3);
            expect(parts[0]).toBe('v1');
        });

        it('should embed user data in the payload', () => {
            const token = createSessionToken(testUser);
            const parts = token.split('.');
            const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'));
            expect(payload.userId).toBe('user-123');
            expect(payload.email).toBe('test@example.com');
            expect(payload.firstName).toBe('John');
            expect(payload.lastName).toBe('Doe');
            expect(payload.role).toBe('user');
        });

        it('should default role to user when not provided', () => {
            const token = createSessionToken({ id: 'u1', email: 'a@b.com', firstName: 'A', lastName: 'B' });
            const parts = token.split('.');
            const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'));
            expect(payload.role).toBe('user');
        });

        it('should set expiresAt in the future', () => {
            const token = createSessionToken(testUser);
            const parts = token.split('.');
            const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'));
            const now = Math.floor(Date.now() / 1000);
            expect(payload.expiresAt).toBeGreaterThan(now);
        });
    });

    describe('verifySessionToken', () => {
        it('should verify a valid token and return the payload', () => {
            const token = createSessionToken(testUser);
            const result = verifySessionToken(token);
            expect(result).not.toBeNull();
            expect(result!.userId).toBe('user-123');
            expect(result!.email).toBe('test@example.com');
        });

        it('should reject a tampered payload', () => {
            const token = createSessionToken(testUser);
            const parts = token.split('.');
            // Tamper with payload
            const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'));
            payload.userId = 'hacker-999';
            const tamperedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
            const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
            expect(verifySessionToken(tamperedToken)).toBeNull();
        });

        it('should reject a token with wrong version', () => {
            const token = createSessionToken(testUser);
            const parts = token.split('.');
            const tamperedToken = `v2.${parts[1]}.${parts[2]}`;
            expect(verifySessionToken(tamperedToken)).toBeNull();
        });

        it('should reject a token with too few parts', () => {
            expect(verifySessionToken('only.two')).toBeNull();
        });

        it('should reject a token with empty parts', () => {
            expect(verifySessionToken('v1..')).toBeNull();
        });

        it('should reject an expired token', () => {
            // Create token, then manipulate time
            const token = createSessionToken(testUser);
            const parts = token.split('.');
            const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'));
            // Set expiry to past
            payload.expiresAt = Math.floor(Date.now() / 1000) - 3600;
            const expiredPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
            // Re-sign with correct secret
            const crypto = require('crypto');
            const dataToSign = `v1.${expiredPayload}`;
            const signature = crypto
                .createHmac('sha256', process.env.SESSION_SECRET)
                .update(dataToSign)
                .digest('base64url');
            const expiredToken = `v1.${expiredPayload}.${signature}`;
            expect(verifySessionToken(expiredToken)).toBeNull();
        });
    });
});

describe('Signed Download Token', () => {
    const userId = 'user-456';
    const resourceType = 'invoice';
    const resourceId = 'inv-789';

    describe('createSignedDownloadToken', () => {
        it('should create a token with 2 parts (payload.signature)', () => {
            const token = createSignedDownloadToken(userId, resourceType, resourceId);
            const parts = token.split('.');
            expect(parts.length).toBe(2);
        });
    });

    describe('verifySignedDownloadToken', () => {
        it('should verify a valid download token', () => {
            const token = createSignedDownloadToken(userId, resourceType, resourceId);
            const result = verifySignedDownloadToken(token, userId, resourceType, resourceId);
            expect(result).not.toBeNull();
            expect(result!.userId).toBe(userId);
            expect(result!.resourceType).toBe(resourceType);
            expect(result!.resourceId).toBe(resourceId);
        });

        it('should reject token with wrong userId', () => {
            const token = createSignedDownloadToken(userId, resourceType, resourceId);
            const result = verifySignedDownloadToken(token, 'wrong-user', resourceType, resourceId);
            expect(result).toBeNull();
        });

        it('should reject token with wrong resourceType', () => {
            const token = createSignedDownloadToken(userId, resourceType, resourceId);
            const result = verifySignedDownloadToken(token, userId, 'wrong-type', resourceId);
            expect(result).toBeNull();
        });

        it('should reject token with wrong resourceId', () => {
            const token = createSignedDownloadToken(userId, resourceType, resourceId);
            const result = verifySignedDownloadToken(token, userId, resourceType, 'wrong-id');
            expect(result).toBeNull();
        });

        it('should reject tampered token', () => {
            const token = createSignedDownloadToken(userId, resourceType, resourceId);
            const result = verifySignedDownloadToken(token + 'x', userId, resourceType, resourceId);
            expect(result).toBeNull();
        });

        it('should reject token with bad format', () => {
            expect(verifySignedDownloadToken('bad', userId, resourceType, resourceId)).toBeNull();
        });

        it('should reject expired download token', () => {
            // Create token that expires immediately
            const token = createSignedDownloadToken(userId, resourceType, resourceId, -1);
            const result = verifySignedDownloadToken(token, userId, resourceType, resourceId);
            expect(result).toBeNull();
        });
    });
});
