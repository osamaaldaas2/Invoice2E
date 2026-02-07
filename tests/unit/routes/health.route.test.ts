import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before imports
const createServerClientMock = vi.hoisted(() => vi.fn());
const loggerMock = vi.hoisted(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
}));

vi.mock('@/lib/supabase.server', () => ({
    createServerClient: () => createServerClientMock(),
}));

vi.mock('@/lib/logger', () => ({
    logger: loggerMock,
}));

vi.mock('@/lib/constants', () => ({
    APP_VERSION: '1.0.0',
}));

// Import after mocks
import { GET } from '@/app/api/health/route';

describe('Health API Route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('GET /api/health', () => {
        it('should return ok status when database is healthy', async () => {
            createServerClientMock.mockReturnValue({
                from: vi.fn(() => ({
                    select: vi.fn(() => ({
                        limit: vi.fn(() => Promise.resolve({ error: null })),
                    })),
                })),
            });

            const response = await GET();
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.status).toBe('ok');
            expect(data.version).toBe('1.0.0');
            expect(data.checks).toBeDefined();
            expect(data.checks.database).toBe('ok');
            expect(typeof data.checks.uptime).toBe('number');
        });

        it('should return degraded status when database has errors', async () => {
            createServerClientMock.mockReturnValue({
                from: vi.fn(() => ({
                    select: vi.fn(() => ({
                        limit: vi.fn(() => Promise.resolve({ error: new Error('DB error') })),
                    })),
                })),
            });

            const response = await GET();
            const data = await response.json();

            expect(response.status).toBe(503);
            expect(data.status).toBe('degraded');
            expect(data.checks.database).toBe('error');
        });

        it('should return error status on exception', async () => {
            createServerClientMock.mockReturnValue({
                from: vi.fn(() => {
                    throw new Error('Connection failed');
                }),
            });

            const response = await GET();
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.status).toBe('error');
            expect(loggerMock.error).toHaveBeenCalled();
        });

        it('should include timestamp in response', async () => {
            createServerClientMock.mockReturnValue({
                from: vi.fn(() => ({
                    select: vi.fn(() => ({
                        limit: vi.fn(() => Promise.resolve({ error: null })),
                    })),
                })),
            });

            const response = await GET();
            const data = await response.json();

            expect(data.timestamp).toBeDefined();
            expect(new Date(data.timestamp).getTime()).not.toBeNaN();
        });
    });
});
