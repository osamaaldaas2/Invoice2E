import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before imports
const sessionMock = vi.hoisted(() => ({
    clearSessionCookie: vi.fn(),
}));
const loggerMock = vi.hoisted(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
}));

vi.mock('@/lib/session', () => sessionMock);

vi.mock('@/lib/logger', () => ({
    logger: loggerMock,
}));

vi.mock('@/lib/api-helpers', () => ({
    handleApiError: vi.fn((error) => {
        const { NextResponse } = require('next/server');
        return NextResponse.json({
            success: false,
            error: 'Failed to logout'
        }, { status: 500 });
    }),
}));

import { POST } from '@/app/api/auth/logout/route';

describe('Logout API Route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('POST /api/auth/logout', () => {
        it('should return 200 on successful logout', async () => {
            sessionMock.clearSessionCookie.mockResolvedValue(undefined);

            const response = await POST();
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.message).toBe('Logged out successfully');
            expect(sessionMock.clearSessionCookie).toHaveBeenCalled();
        });

        it('should log logout event', async () => {
            sessionMock.clearSessionCookie.mockResolvedValue(undefined);

            await POST();

            expect(loggerMock.info).toHaveBeenCalledWith('User logged out');
        });

        it('should handle errors gracefully', async () => {
            sessionMock.clearSessionCookie.mockRejectedValue(new Error('Cookie error'));

            const response = await POST();
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.success).toBe(false);
        });
    });
});
