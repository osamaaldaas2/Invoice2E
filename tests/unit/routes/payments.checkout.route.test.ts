import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Mock dependencies before imports
const getAuthenticatedUserMock = vi.hoisted(() => vi.fn());
const packageServiceMock = vi.hoisted(() => ({
  getPackageBySlug: vi.fn(),
  getPackageById: vi.fn(),
  getActivePackages: vi.fn(),
}));
const stripeAdapterMock = vi.hoisted(() => ({
  createCheckoutSession: vi.fn(),
}));
const paypalAdapterMock = vi.hoisted(() => ({
  createOrder: vi.fn(),
}));
const createAdminClientMock = vi.hoisted(() => vi.fn());
// FIX: Re-audit #10 — removed createUserClientMock (deprecated export deleted)
const createUserScopedClientMock = vi.hoisted(() => vi.fn());
const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getAuthenticatedUser: getAuthenticatedUserMock,
}));

vi.mock('@/services/package.service', () => ({
  packageService: packageServiceMock,
}));

vi.mock('@/adapters/stripe.adapter', () => ({
  stripeAdapter: stripeAdapterMock,
}));

vi.mock('@/adapters/paypal.adapter', () => ({
  paypalAdapter: paypalAdapterMock,
}));

vi.mock('@/lib/supabase.server', () => ({
  createAdminClient: () => createAdminClientMock(),
  createUserScopedClient: (...args: any[]) => createUserScopedClientMock(...args),
}));

vi.mock('@/lib/logger', () => ({
  logger: loggerMock,
}));

vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimitAsync: vi.fn().mockResolvedValue({ allowed: true }),
  getRequestIdentifier: vi.fn().mockReturnValue('test-ip'),
}));

vi.mock('@/lib/api-helpers', () => ({
  handleApiError: vi.fn((error) => {
    const { NextResponse } = require('next/server');
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }),
}));

import { POST, GET } from '@/app/api/payments/create-checkout/route';

describe('Payment Checkout API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const activePackage = {
    id: 'pkg-123',
    slug: 'basic',
    name: 'Basic',
    name_de: null,
    description: 'Basic package',
    description_de: null,
    credits: 10,
    price: 10,
    currency: 'EUR',
    is_popular: false,
    savings_percent: null,
    sort_order: 1,
    is_active: true,
    stripe_price_id: null,
    paypal_plan_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

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
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 for invalid payment method', async () => {
      getAuthenticatedUserMock.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
      });
      packageServiceMock.getPackageBySlug.mockResolvedValue(activePackage);

      const request = createRequest({
        packageId: 'basic',
        method: 'invalid_method',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid payment method');
      expect(stripeAdapterMock.createCheckoutSession).not.toHaveBeenCalled();
      expect(paypalAdapterMock.createOrder).not.toHaveBeenCalled();
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
      expect(data.error).toBe('Invalid or inactive package');
    });

    it('should create a stripe checkout session and transaction record', async () => {
      getAuthenticatedUserMock.mockResolvedValue({
        id: 'user-123',
        email: 'fallback@example.com',
      });
      packageServiceMock.getPackageBySlug.mockResolvedValue(activePackage);
      stripeAdapterMock.createCheckoutSession.mockResolvedValue({
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/c/pay/cs_test_123',
      });

      const mockUserScopedClient = {
        from: vi.fn((table: string) => {
          if (table === 'users') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn(() =>
                    Promise.resolve({
                      data: { email: 'db@example.com' },
                      error: null,
                    })
                  ),
                })),
              })),
            };
          }
          // payment_transactions
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: { id: 'tx-123' },
                    error: null,
                  })
                ),
              })),
            })),
          };
        }),
      };
      createUserScopedClientMock.mockResolvedValue(mockUserScopedClient);

      const request = createRequest({
        packageId: 'basic',
        method: 'stripe',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.method).toBe('stripe');
      expect(data.sessionId).toBe('cs_test_123');
      expect(data.transactionId).toBe('tx-123');
      expect(stripeAdapterMock.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          packageId: 'basic',
          credits: 10,
          amount: 1000,
          currency: 'eur',
          email: 'db@example.com',
        })
      );
    });
  });

  describe('GET /api/payments/create-checkout', () => {
    it('should return available packages', async () => {
      packageServiceMock.getActivePackages.mockResolvedValue([
        { ...activePackage, savings_percent: 15 },
      ]);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.packages).toHaveLength(1);
      expect(data.packages[0].pricePerCredit).toBe(1);
      expect(data.packages[0].discount).toBe(15);
    });
  });
});
