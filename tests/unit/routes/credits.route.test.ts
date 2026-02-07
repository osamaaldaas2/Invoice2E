import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Mock dependencies before imports
const createServerClientMock = vi.hoisted(() => vi.fn());
const loggerMock = vi.hoisted(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
}));
const getSessionMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase.server', () => ({
    createServerClient: () => createServerClientMock(),
}));

vi.mock('@/lib/logger', () => ({
    logger: loggerMock,
}));

vi.mock('@/lib/session', () => ({
    getSession: getSessionMock,
}));

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
import { GET } from '@/app/api/credits/route';

describe('Credits API Route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const createRequest = () => {
        return new NextRequest('http://localhost:3000/api/credits', {
            method: 'GET',
        });
    };

    describe('GET /api/credits', () => {
        it('should return 401 when not authenticated', async () => {
            getSessionMock.mockResolvedValue(null);

            const request = createRequest();
            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(401);
            expect(data.success).toBe(false);
            expect(data.error).toContain('Unauthorized');
        });

        it('should return user credits when authenticated', async () => {
            getSessionMock.mockResolvedValue({ id: 'user-123' });

            createServerClientMock.mockReturnValue({
                from: vi.fn(() => ({
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            single: vi.fn(() => Promise.resolve({
                                data: { credits: 50 },
                                error: null,
                            })),
                        })),
                    })),
                })),
            });

            const request = createRequest();
            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.data.credits).toBe(50);
        });

        it('should return 0 credits for new user', async () => {
            getSessionMock.mockResolvedValue({ id: 'user-123' });

            createServerClientMock.mockReturnValue({
                from: vi.fn(() => ({
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            single: vi.fn(() => Promise.resolve({
                                data: null,
                                error: { code: 'PGRST116' },
                            })),
                        })),
                    })),
                })),
            });

            const request = createRequest();
            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.data.credits).toBe(0);
        });

        it('should handle database errors', async () => {
            getSessionMock.mockResolvedValue({ id: 'user-123' });

            createServerClientMock.mockReturnValue({
                from: vi.fn(() => ({
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            single: vi.fn(() => Promise.resolve({
                                data: null,
                                error: { message: 'Database error' },
                            })),
                        })),
                    })),
                })),
            });

            const request = createRequest();
            const response = await GET(request);

            expect(response.status).toBe(500);
        });
    });
});
