import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StripeAdapter } from '@/adapters/stripe.adapter';

describe('StripeAdapter', () => {
    let adapter: StripeAdapter;
    let mockFetch: any;

    beforeEach(() => {
        vi.stubEnv('STRIPE_SECRET_KEY', 'test-secret-key');
        vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'test-webhook-secret');

        mockFetch = vi.fn();
        global.fetch = mockFetch;

        adapter = new StripeAdapter();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should create checkout session successfully', async () => {
        const mockResponse = {
            ok: true,
            json: async () => ({
                id: 'sess_123',
                url: 'https://checkout.stripe.com/test'
            })
        };
        mockFetch.mockResolvedValue(mockResponse);

        const params = {
            userId: 'user_123',
            email: 'test@example.com',
            packageId: 'pkg_1',
            credits: 10,
            amount: 1000,
            currency: 'EUR',
            successUrl: 'https://example.com/success',
            cancelUrl: 'https://example.com/cancel'
        };

        const result = await adapter.createCheckoutSession(params);

        expect(result.id).toBe('sess_123');
        expect(result.url).toBe('https://checkout.stripe.com/test');
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.stripe.com/v1/checkout/sessions',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'Authorization': 'Bearer test-secret-key'
                })
            })
        );
    });

    it('should construct webhook event verification', async () => {
        // Since logic is internal manual verification for now
        const payload = JSON.stringify({ type: 'test' });
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = `t=${timestamp},v1=sig`;

        const event = await adapter.constructWebhookEvent(payload, signature);
        expect(event).toEqual({ type: 'test' });
    });

    it('should retrieve checkout session', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                id: 'sess_123',
                payment_status: 'paid',
                payment_intent: 'pi_123',
                metadata: { credits: '10' }
            })
        });

        const session = await adapter.retrieveCheckoutSession('sess_123');
        expect(session.payment_status).toBe('paid');
        expect(session.paymentIntentId).toBe('pi_123');
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.stripe.com/v1/checkout/sessions/sess_123',
            expect.any(Object)
        );
    });

    it('should refund payment', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                id: 're_123',
                status: 'succeeded',
                amount: 1000
            })
        });

        const refund = await adapter.refundPayment('pi_123');
        expect(refund.id).toBe('re_123');
        expect(refund.status).toBe('succeeded');
    });

    it('should handle API errors', async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            text: async () => 'Error message'
        });

        const params = {
            userId: 'user_123',
            email: 'test@example.com',
            packageId: 'pkg_1',
            credits: 10,
            amount: 1000,
            currency: 'EUR',
            successUrl: 'success',
            cancelUrl: 'cancel'
        };

        await expect(adapter.createCheckoutSession(params))
            .rejects
            .toThrow('Failed to create checkout session');
    });
});
