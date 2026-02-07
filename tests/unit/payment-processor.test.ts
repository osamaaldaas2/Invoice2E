import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerClientMock = vi.hoisted(() => vi.fn());
const stripeServiceMock = vi.hoisted(() => ({
    isConfigured: vi.fn(),
    createCheckoutSession: vi.fn()
}));
const paypalServiceMock = vi.hoisted(() => ({
    isConfigured: vi.fn(),
    createOrder: vi.fn(),
    captureOrder: vi.fn()
}));
const emailServiceMock = vi.hoisted(() => ({
    sendPaymentConfirmationEmail: vi.fn()
}));

vi.mock('@/lib/supabase.server', () => ({
    createServerClient: () => createServerClientMock()
}));

vi.mock('@/services/stripe.service', () => ({
    stripeService: stripeServiceMock,
    CREDIT_PACKAGES: [
        { id: 'basic_10', name: 'Basic', credits: 10, price: 1000, currency: 'EUR', description: 'Basic' }
    ]
}));

vi.mock('@/services/paypal.service', () => ({
    paypalService: paypalServiceMock
}));

vi.mock('@/services/email.service', () => ({
    emailService: emailServiceMock
}));

import { PaymentProcessor } from '@/services/payment-processor';

const makeSelectSingle = (data: unknown, error: unknown = null) => {
    const api: any = {
        select: vi.fn(() => api),
        eq: vi.fn(() => api),
        single: vi.fn(async () => ({ data, error }))
    };
    return api;
};

const makeInsert = (data: unknown = null, error: unknown = null) => ({
    insert: vi.fn(async () => ({ data, error }))
});

describe('PaymentProcessor', () => {
    let processor: PaymentProcessor;

    beforeEach(() => {
        vi.clearAllMocks();
        processor = new PaymentProcessor();
    });

    it('processPayment throws for invalid package', async () => {
        stripeServiceMock.isConfigured.mockReturnValue(true);

        await expect(
            processor.processPayment('stripe', 'user-1', 'invalid_pkg', 't@example.com', 'ok', 'cancel')
        ).rejects.toThrow('Invalid package');
    });

    it('processPayment creates stripe session when configured', async () => {
        stripeServiceMock.isConfigured.mockReturnValue(true);
        stripeServiceMock.createCheckoutSession.mockResolvedValue({
            sessionId: 'cs_test',
            url: 'https://checkout.test'
        });

        createServerClientMock.mockReturnValue({
            from: vi.fn(() => makeInsert(null, null))
        });

        const result = await processor.processPayment(
            'stripe',
            'user-1',
            'basic_10',
            't@example.com',
            'ok',
            'cancel'
        );

        expect(result.method).toBe('stripe');
        expect(result.sessionId).toBe('cs_test');
        expect(result.url).toBe('https://checkout.test');
        expect(result.credits).toBe(10);
    });

    it('handleStripeWebhook returns already processed when event exists', async () => {
        createServerClientMock.mockReturnValue({
            from: vi.fn()
                .mockReturnValueOnce(makeSelectSingle({ id: 'evt_1' })) // existing webhook event
        });

        const addSpy = vi.spyOn(processor, 'addCreditsToUser');
        const result = await processor.handleStripeWebhook({
            type: 'checkout.session.completed',
            id: 'evt_1',
            data: { object: { metadata: { userId: 'user-1', credits: '10' }, payment_intent: 'pi_1', id: 'cs_1' } }
        });

        expect(result.success).toBe(true);
        expect(result.message).toBe('Already processed');
        expect(addSpy).not.toHaveBeenCalled();
    });
});
