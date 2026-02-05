import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PayPalAdapter } from '@/adapters/paypal.adapter';

describe('PayPalAdapter', () => {
    let adapter: PayPalAdapter;
    let mockFetch: any;

    beforeEach(() => {
        vi.stubEnv('PAYPAL_CLIENT_ID', 'test-client-id');
        vi.stubEnv('PAYPAL_CLIENT_SECRET', 'test-client-secret');
        vi.stubEnv('PAYPAL_WEBHOOK_ID', 'test-webhook-id');
        vi.stubEnv('NODE_ENV', 'test');

        mockFetch = vi.fn();
        global.fetch = mockFetch;

        adapter = new PayPalAdapter();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const mockAuthResponse = {
        ok: true,
        json: async () => ({
            access_token: 'mock_token',
            expires_in: 3600
        })
    };

    it('should create order successfully', async () => {
        // Mock Auth then Create Order
        mockFetch
            .mockResolvedValueOnce(mockAuthResponse)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    id: 'order_123',
                    status: 'CREATED',
                    links: [
                        { rel: 'approve', href: 'https://paypal.com/approve' }
                    ]
                })
            });

        const params = {
            userId: 'user_123',
            packageId: 'pkg_1',
            credits: 10,
            amount: 1000,
            currency: 'EUR',
            returnUrl: 'return',
            cancelUrl: 'cancel'
        };

        const result = await adapter.createOrder(params);

        expect(result.id).toBe('order_123');
        expect(result.approvalUrl).toBe('https://paypal.com/approve');

        // Verify Auth call
        expect(mockFetch).toHaveBeenNthCalledWith(1,
            expect.stringContaining('/v1/oauth2/token'),
            expect.anything()
        );
        // Verify Create Order call
        expect(mockFetch).toHaveBeenNthCalledWith(2,
            expect.stringContaining('/v2/checkout/orders'),
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'Authorization': 'Bearer mock_token'
                })
            })
        );
    });

    it('should capture order successfully', async () => {
        // Auth then Capture
        mockFetch
            .mockResolvedValueOnce(mockAuthResponse)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    id: 'capture_123',
                    status: 'COMPLETED',
                    purchase_units: [{
                        amount: { value: '10.00' }
                    }]
                })
            });

        const result = await adapter.captureOrder('order_123');

        expect(result.id).toBe('capture_123');
        expect(result.status).toBe('COMPLETED');
        expect(result.amount).toBe(10);
    });

    it('should get order details with customId', async () => {
        // Auth then Get Order
        mockFetch
            .mockResolvedValueOnce(mockAuthResponse)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    id: 'order_123',
                    status: 'APPROVED',
                    links: [],
                    purchase_units: [{
                        custom_id: '{"credits":10}'
                    }]
                })
            });

        const result = await adapter.getOrder('order_123');

        expect(result.id).toBe('order_123');
        expect(result.customId).toBe('{"credits":10}');
    });

    it('should verify webhook signature', async () => {
        // Auth then Verify
        mockFetch
            .mockResolvedValueOnce(mockAuthResponse)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    verification_status: 'SUCCESS'
                })
            });

        const headers = {
            'paypal-auth-algo': 'algo',
            'paypal-cert-url': 'url',
            'paypal-transmission-id': 'id',
            'paypal-transmission-sig': 'sig',
            'paypal-transmission-time': 'time'
        };
        const body = JSON.stringify({ event_type: 'PAYMENT.CAPTURE.COMPLETED' });

        const isValid = await adapter.verifyWebhook(headers, body);
        expect(isValid).toBe(true);
    });
});
