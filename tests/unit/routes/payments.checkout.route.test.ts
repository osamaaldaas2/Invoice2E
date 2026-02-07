import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Mock dependencies before imports
const getAuthenticatedUserMock = vi.hoisted(() => vi.fn());
const stripeServiceMock = vi.hoisted(() => ({
    isConfigured: vi.fn(),
    createCheckoutSession: vi.fn(),
}));
const paypalServiceMock = vi.hoisted(() => ({
    isConfigured: vi.fn(),
    createOrder: vi.fn(),
}));
const createServerClientMock = vi.hoisted(() => vi.fn());
const createUserClientMock = vi.hoisted(() => vi.fn());
const loggerMock = vi.hoisted(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
    getAuthenticatedUser: getAuthenticatedUserMock,
}));

vi.mock('@/services/stripe.service', () => ({
    stripeService: stripeServiceMock,
}));

vi.mock('@/services/paypal.service', () => ({
    paypalService: paypalServiceMock,
}));

vi.mock('@/lib/supabase.server', () => ({
    createServerClient: () => createServerClientMock(),
    createUserClient: () => createUserClientMock(),
}));

vi.mock('@/lib/logger', () => ({
    logger: loggerMock,
}));

vi.mock('@/lib/api-helpers', () => ({
    handleApiError: vi.fn((error) => {
        const { NextResponse } = require('next/server');
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }),
}));

import { POST, GET } from '@/app/api/payments/create-checkout/route';

describe('Payment Checkout API Route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const createRequest = (body: object) => {
        return new NextRequest('http://localhost:3000/api/payments/create-checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    };

    describe('POST /api/payments/create-checkout', () => {
        it('should return 401 when not authenticated', async () => {
            getAuthenticatedUserMock.mockResolvedValue(null);

            const request = createRequest({
                packageId: 'basic',
                method: 'stripe',
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(401);
            expect(data.success).toBe(false);
        });

        it('should return 400 for invalid payment method', async () => {
            getAuthenticatedUserMock.mockResolvedValue({
                id: 'user-123',
                email: 'test@example.com',
            });

            const request = createRequest({
                packageId: 'basic',
                method: 'invalid_method',
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.success).toBe(false);
        });

        it('should return 400 for missing packageId', async () => {
            getAuthenticatedUserMock.mockResolvedValue({
                id: 'user-123',
                email: 'test@example.com',
            });

            const request = createRequest({
                method: 'stripe',
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.success).toBe(false);
        });
    });

    describe('GET /api/payments/create-checkout', () => {
        it('should return available packages', async () => {
            const mockPackages = [
                { id: 'basic', name: 'Basic', credits: 10, price_cents: 1000 },
            ];

            createServerClientMock.mockReturnValue({
                from: vi.fn(() => ({
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            order: vi.fn(() => Promise.resolve({
                                data: mockPackages,
                                error: null,
                            })),
                        })),
                    })),
                })),
            });

            const response = await GET();
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
        });
    });
});
