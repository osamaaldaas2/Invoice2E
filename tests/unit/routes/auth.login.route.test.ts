import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Mock dependencies before imports
const authServiceMock = vi.hoisted(() => ({
    login: vi.fn(),
}));
const loggerMock = vi.hoisted(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
}));
const rateLimitMock = vi.hoisted(() => ({
    checkRateLimit: vi.fn(),
    getRequestIdentifier: vi.fn(),
    resetRateLimit: vi.fn(),
}));
const sessionMock = vi.hoisted(() => ({
    setSessionCookie: vi.fn(),
}));

vi.mock('@/services/auth.service', () => ({
    authService: authServiceMock,
}));

vi.mock('@/lib/logger', () => ({
    logger: loggerMock,
}));

vi.mock('@/lib/rate-limiter', () => rateLimitMock);

vi.mock('@/lib/session', () => sessionMock);

vi.mock('@/lib/api-helpers', () => ({
    handleApiError: vi.fn((error, context, options) => {
        const { Response } = require('next/server');
        return new Response(JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }), { status: 500 });
    }),
}));

// Import after mocks
import { POST } from '@/app/api/auth/login/route';

describe('Login API Route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        rateLimitMock.checkRateLimit.mockReturnValue({ allowed: true });
        rateLimitMock.getRequestIdentifier.mockReturnValue('test-id');
    });

    const createRequest = (body: object) => {
        return new NextRequest('http://localhost:3000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    };

    describe('POST /api/auth/login', () => {
        it('should return 400 for invalid email format', async () => {
            const request = createRequest({
                email: 'invalid-email',
                password: 'password123',
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.success).toBe(false);
        });

        it('should return 400 for missing password', async () => {
            const request = createRequest({
                email: 'test@example.com',
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.success).toBe(false);
        });

        it('should return 429 when rate limited', async () => {
            rateLimitMock.checkRateLimit.mockReturnValue({
                allowed: false,
                blockedForSeconds: 900,
                resetInSeconds: 900,
            });

            const request = createRequest({
                email: 'test@example.com',
                password: 'password123',
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(429);
            expect(data.success).toBe(false);
            expect(response.headers.get('Retry-After')).toBe('900');
        });

        it('should return 200 on successful login', async () => {
            const mockUser = {
                id: 'user-123',
                email: 'test@example.com',
                name: 'Test User',
            };
            authServiceMock.login.mockResolvedValue(mockUser);

            const request = createRequest({
                email: 'test@example.com',
                password: 'password123',
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.data.id).toBe('user-123');
            expect(data.message).toBe('Logged in successfully');
            expect(sessionMock.setSessionCookie).toHaveBeenCalledWith(mockUser);
            expect(rateLimitMock.resetRateLimit).toHaveBeenCalled();
        });

        it('should normalize email to lowercase', async () => {
            authServiceMock.login.mockResolvedValue({
                id: 'user-123',
                email: 'test@example.com',
            });

            const request = createRequest({
                email: 'TEST@EXAMPLE.COM',
                password: 'password123',
            });

            await POST(request);

            expect(authServiceMock.login).toHaveBeenCalledWith(
                expect.objectContaining({ email: 'test@example.com' })
            );
        });

        it('should log successful login', async () => {
            authServiceMock.login.mockResolvedValue({
                id: 'user-123',
                email: 'test@example.com',
            });

            const request = createRequest({
                email: 'test@example.com',
                password: 'password123',
            });

            await POST(request);

            expect(loggerMock.info).toHaveBeenCalledWith(
                'Login successful',
                expect.objectContaining({ userId: 'user-123' })
            );
        });
    });
});
