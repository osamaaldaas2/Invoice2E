import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Mock dependencies before imports
const sessionMock = vi.hoisted(() => ({
    getSessionFromCookie: vi.fn(),
}));

vi.mock('@/lib/session', () => sessionMock);

vi.mock('@/lib/api-helpers', () => ({
    handleApiError: vi.fn((_error) => {
        const { NextResponse } = require('next/server');
        return NextResponse.json({
            success: false,
            error: 'Authentication check failed'
        }, { status: 500 });
    }),
}));

import { GET } from '@/app/api/auth/me/route';

describe('Auth Me API Route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const createRequest = () => {
        return new NextRequest('http://localhost:3000/api/auth/me', {
            method: 'GET',
        });
    };

    describe('GET /api/auth/me', () => {
        it('should return 401 when not authenticated', async () => {
            sessionMock.getSessionFromCookie.mockResolvedValue(null);

            const request = createRequest();
            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(401);
            expect(data.success).toBe(false);
            expect(data.error).toBe('Not authenticated');
        });

        it('should return user data when authenticated', async () => {
            sessionMock.getSessionFromCookie.mockResolvedValue({
                userId: 'user-123',
                email: 'test@example.com',
                firstName: 'John',
                lastName: 'Doe',
                role: 'user',
            });

            const request = createRequest();
            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.data.id).toBe('user-123');
            expect(data.data.email).toBe('test@example.com');
            expect(data.data.firstName).toBe('John');
            expect(data.data.lastName).toBe('Doe');
            expect(data.data.role).toBe('user');
        });

        it('should return admin role when user is admin', async () => {
            sessionMock.getSessionFromCookie.mockResolvedValue({
                userId: 'admin-123',
                email: 'admin@example.com',
                firstName: 'Admin',
                lastName: 'User',
                role: 'admin',
            });

            const request = createRequest();
            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.data.role).toBe('admin');
        });

        it('should default to user role when role is not set', async () => {
            sessionMock.getSessionFromCookie.mockResolvedValue({
                userId: 'user-123',
                email: 'test@example.com',
                firstName: 'John',
                lastName: 'Doe',
                role: undefined,
            });

            const request = createRequest();
            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.data.role).toBe('user');
        });
        it('should handle session errors', async () => {
            sessionMock.getSessionFromCookie.mockRejectedValue(new Error('Session error'));

            const request = createRequest();
            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.success).toBe(false);
        });
    });
});
