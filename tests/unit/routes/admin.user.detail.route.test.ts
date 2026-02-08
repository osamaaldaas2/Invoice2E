import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const authorizationMock = vi.hoisted(() => ({
    requireAdmin: vi.fn(),
    requireSuperAdmin: vi.fn(),
    getClientIp: vi.fn(() => '127.0.0.1'),
    getUserAgent: vi.fn(() => 'vitest'),
}));

const userServiceMock = vi.hoisted(() => ({
    getUserById: vi.fn(),
    changeRole: vi.fn(),
}));

const rateLimiterMock = vi.hoisted(() => ({
    checkRateLimitAsync: vi.fn(),
    getRequestIdentifier: vi.fn(() => 'req-id'),
}));

vi.mock('@/lib/authorization', () => authorizationMock);
vi.mock('@/services/admin', () => ({
    adminUserService: userServiceMock,
}));
vi.mock('@/lib/rate-limiter', () => rateLimiterMock);
vi.mock('@/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

import { GET, PATCH } from '@/app/api/admin/users/[id]/route';

describe('Admin User Detail Route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        authorizationMock.requireAdmin.mockResolvedValue({ id: 'admin-1', role: 'admin' });
        authorizationMock.requireSuperAdmin.mockResolvedValue({ id: 'super-1', role: 'super_admin' });
        rateLimiterMock.checkRateLimitAsync.mockResolvedValue({ allowed: true, resetInSeconds: 60 });
    });

    const getContext = (id = 'user-123') => ({
        params: Promise.resolve({ id }),
    });

    it('GET returns user detail for admin', async () => {
        userServiceMock.getUserById.mockResolvedValue({
            id: 'user-123',
            email: 'test@example.com',
            firstName: 'Test',
            lastName: 'User',
            role: 'user',
            isBanned: false,
            loginCount: 1,
            availableCredits: 10,
            usedCredits: 5,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const request = new NextRequest('http://localhost:3000/api/admin/users/user-123');
        const response = await GET(request, getContext());
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.id).toBe('user-123');
        expect(userServiceMock.getUserById).toHaveBeenCalledWith('user-123');
    });

    it('PATCH changes role for super admin', async () => {
        userServiceMock.changeRole.mockResolvedValue({
            id: 'user-123',
            email: 'test@example.com',
            firstName: 'Test',
            lastName: 'User',
            role: 'admin',
            isBanned: false,
            loginCount: 1,
            availableCredits: 10,
            usedCredits: 5,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const request = new NextRequest('http://localhost:3000/api/admin/users/user-123', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'admin' }),
        });

        const response = await PATCH(request, getContext());
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(userServiceMock.changeRole).toHaveBeenCalledWith(
            { userId: 'user-123', newRole: 'admin' },
            'super-1',
            '127.0.0.1',
            'vitest'
        );
    });

    it('PATCH rejects invalid role payload', async () => {
        const request = new NextRequest('http://localhost:3000/api/admin/users/user-123', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'owner' }),
        });

        const response = await PATCH(request, getContext());
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
    });
});
