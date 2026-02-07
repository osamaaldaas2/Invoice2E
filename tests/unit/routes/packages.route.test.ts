import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before imports
const packageServiceMock = vi.hoisted(() => ({
    getActivePackages: vi.fn(),
}));

vi.mock('@/services/package.service', () => ({
    packageService: packageServiceMock,
}));

vi.mock('@/lib/api-helpers', () => ({
    handleApiError: vi.fn((_error) => {
        const { NextResponse } = require('next/server');
        return NextResponse.json({
            success: false,
            error: 'Failed to load pricing packages'
        }, { status: 500 });
    }),
}));

import { GET } from '@/app/api/packages/route';

describe('Packages API Route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('GET /api/packages', () => {
        it('should return all active packages', async () => {
            const mockPackages = [
                { id: 'basic', name: 'Basic', credits: 10, price: 10 },
                { id: 'pro', name: 'Pro', credits: 50, price: 40 },
                { id: 'enterprise', name: 'Enterprise', credits: 200, price: 150 },
            ];
            packageServiceMock.getActivePackages.mockResolvedValue(mockPackages);

            const response = await GET();
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.packages).toHaveLength(3);
            expect(data.packages[0].name).toBe('Basic');
            expect(data.timestamp).toBeDefined();
        });

        it('should return empty array when no packages exist', async () => {
            packageServiceMock.getActivePackages.mockResolvedValue([]);

            const response = await GET();
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.packages).toHaveLength(0);
        });

        it('should include timestamp in response', async () => {
            packageServiceMock.getActivePackages.mockResolvedValue([]);

            const response = await GET();
            const data = await response.json();

            expect(data.timestamp).toBeDefined();
            expect(new Date(data.timestamp).getTime()).not.toBeNaN();
        });

        it('should handle service errors', async () => {
            packageServiceMock.getActivePackages.mockRejectedValue(
                new Error('Database connection failed')
            );

            const response = await GET();
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.success).toBe(false);
        });
    });
});
