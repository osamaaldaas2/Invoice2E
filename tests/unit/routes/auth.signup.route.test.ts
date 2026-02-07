import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Mock dependencies before imports
const authServiceMock = vi.hoisted(() => ({
    signup: vi.fn(),
}));
const loggerMock = vi.hoisted(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
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

vi.mock('@/lib/session', () => sessionMock);

vi.mock('@/lib/api-helpers', () => ({
    handleApiError: vi.fn((error) => {
        const { NextResponse } = require('next/server');
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }),
}));

import { POST } from '@/app/api/auth/signup/route';

describe('Signup API Route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const createRequest = (body: object) => {
        return new NextRequest('http://localhost:3000/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    };

    describe('POST /api/auth/signup', () => {
        it('should return 400 for invalid email format', async () => {
            const request = createRequest({
                email: 'invalid-email',
                password: 'password123',
                firstName: 'John',
                lastName: 'Doe',
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.success).toBe(false);
        });

        it('should return 400 for missing required fields', async () => {
            const request = createRequest({
                email: 'test@example.com',
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.success).toBe(false);
        });

        it('should return 400 for short password', async () => {
            const request = createRequest({
                email: 'test@example.com',
                password: '123',
                firstName: 'John',
                lastName: 'Doe',
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.success).toBe(false);
        });

        it('should return 201 on successful signup', async () => {
            const mockUser = {
                id: 'user-123',
                email: 'test@example.com',
                firstName: 'John',
                lastName: 'Doe',
            };
            authServiceMock.signup.mockResolvedValue(mockUser);

            const request = createRequest({
                email: 'test@example.com',
                password: 'password123',
                firstName: 'John',
                lastName: 'Doe',
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(201);
            expect(data.success).toBe(true);
            expect(data.data.id).toBe('user-123');
            expect(data.message).toBe('Account created successfully');
            expect(sessionMock.setSessionCookie).toHaveBeenCalledWith(mockUser);
        });

        it('should normalize email to lowercase', async () => {
            authServiceMock.signup.mockResolvedValue({
                id: 'user-123',
                email: 'test@example.com',
            });

            const request = createRequest({
                email: 'TEST@EXAMPLE.COM',
                password: 'password123',
                firstName: 'John',
                lastName: 'Doe',
            });

            await POST(request);

            expect(authServiceMock.signup).toHaveBeenCalledWith(
                expect.objectContaining({ email: 'test@example.com' })
            );
        });

        it('should log successful signup', async () => {
            authServiceMock.signup.mockResolvedValue({
                id: 'user-123',
                email: 'test@example.com',
            });

            const request = createRequest({
                email: 'test@example.com',
                password: 'password123',
                firstName: 'John',
                lastName: 'Doe',
            });

            await POST(request);

            expect(loggerMock.info).toHaveBeenCalledWith(
                'Signup successful',
                expect.objectContaining({ userId: 'user-123' })
            );
        });

        it('should handle service errors', async () => {
            authServiceMock.signup.mockRejectedValue(new Error('Email already exists'));

            const request = createRequest({
                email: 'existing@example.com',
                password: 'password123',
                firstName: 'John',
                lastName: 'Doe',
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.success).toBe(false);
        });
    });
});
