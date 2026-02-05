import { logger } from '@/lib/logger';
import { stripeAdapter } from '@/adapters';

export interface CreditPackage {
    id: string;
    name: string;
    credits: number;
    price: number; // in cents
    currency: string;
    description: string;
    discount?: number;
}

export const CREDIT_PACKAGES: CreditPackage[] = [
    {
        id: 'basic_10',
        name: 'Basic',
        credits: 10,
        price: 999, // roughly 10 EUR
        currency: 'EUR',
        description: '10 Invoice Credits',
        discount: 0,
    },
    {
        id: 'pro_50',
        name: 'Pro',
        credits: 50,
        price: 3999, // roughly 40 EUR
        currency: 'EUR',
        description: '50 Invoice Credits',
        discount: 20, // 20% savings roughly
    },
    {
        id: 'enterprise_200',
        name: 'Enterprise',
        credits: 200,
        price: 14999, // roughly 150 EUR
        currency: 'EUR',
        description: '200 Invoice Credits',
        discount: 25,
    },
];

export interface PaymentResult {
    success: boolean;
    paymentId?: string;
    credits?: number;
    error?: string;
}

export class StripeService {
    /**
     * Check if Stripe is configured
     */
    isConfigured(): boolean {
        // Checking adapter implicitly, but for public API compatibility we might just return true or check env vars directly if not exposed by adapter.
        // Or better, let's just say true as adapter throws if not.
        return !!process.env.STRIPE_SECRET_KEY;
    }

    /**
     * Get credit package by ID
     */
    getPackage(packageId: string): CreditPackage | undefined {
        return CREDIT_PACKAGES.find(p => p.id === packageId);
    }

    /**
     * Create a checkout session
     */
    async createCheckoutSession(
        userId: string,
        packageId: string,
        _email: string, // Unused but kept for interface compatibility
        successUrl: string,
        cancelUrl: string
    ): Promise<{ sessionId: string; url: string }> {
        logger.info('Creating Stripe checkout session', { userId, packageId });

        const pkg = this.getPackage(packageId);
        if (!pkg) {
            throw new Error(`Invalid package ID: ${packageId}`);
        }

        const session = await stripeAdapter.createCheckoutSession({
            userId,
            email: _email,
            packageId,
            credits: pkg.credits,
            amount: pkg.price, // cents
            currency: pkg.currency,
            successUrl,
            cancelUrl
        });

        logger.info('Stripe checkout session created', { sessionId: session.id });

        return {
            sessionId: session.id,
            url: session.url,
        };
    }

    /**
     * Verify webhook signature
     */
    async verifyWebhookSignature(payload: string, signature: string): Promise<boolean> {
        try {
            await stripeAdapter.constructWebhookEvent(payload, signature);
            return true;
        } catch (error) {
            logger.warn('Stripe webhook verification failed', { error });
            return false;
        }
    }

    /**
     * Handle checkout session completed event
     */
    async handlePaymentSuccess(sessionId: string): Promise<PaymentResult> {
        logger.info('Handling Stripe payment success', { sessionId });

        try {
            const session = await stripeAdapter.retrieveCheckoutSession(sessionId);

            if (session.payment_status !== 'paid') {
                return { success: false, error: 'Payment not completed' };
            }

            const credits = parseInt(session.metadata?.credits || '0');

            return {
                success: true,
                paymentId: session.paymentIntentId,
                credits,
            };
        } catch (error) {
            return { success: false, error: 'Failed to retrieve session' };
        }
    }

    /**
     * Get payment status
     */
    async getPaymentStatus(sessionId: string): Promise<string> {
        try {
            const session = await stripeAdapter.retrieveCheckoutSession(sessionId);
            return session.payment_status || 'unknown';
        } catch {
            return 'unknown';
        }
    }

    /**
     * Refund a payment
     * Handles both Payment Intent IDs (pi_...) and Checkout Session IDs (cs_...)
     * Returns the actual payment intent ID used for the refund (useful for updating database)
     */
    async refundPayment(stripeId: string): Promise<{ success: boolean; refundId?: string; error?: string; paymentIntentId?: string }> {
        logger.info('Processing refund', { stripeId });

        try {
            let paymentIntentId = stripeId;
            let wasSessionId = false;

            // If we received a Checkout Session ID instead of a Payment Intent ID,
            // we need to retrieve the session to get the actual payment intent
            if (stripeId.startsWith('cs_')) {
                logger.info('Received checkout session ID, retrieving payment intent', { sessionId: stripeId });
                wasSessionId = true;

                const session = await stripeAdapter.retrieveCheckoutSession(stripeId);

                if (!session.paymentIntentId) {
                    return {
                        success: false,
                        error: 'No payment intent found for this checkout session. The payment may not have been completed.'
                    };
                }

                paymentIntentId = session.paymentIntentId;
                logger.info('Retrieved payment intent from session', {
                    sessionId: stripeId,
                    paymentIntentId
                });
            }

            const refund = await stripeAdapter.refundPayment(paymentIntentId);
            return {
                success: true,
                refundId: refund.id,
                // Return the payment intent ID if we had to convert from a session ID
                paymentIntentId: wasSessionId ? paymentIntentId : undefined
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('Refund failed', { stripeId, error: errorMessage });
            return { success: false, error: errorMessage };
        }
    }
}

// Export singleton instance
export const stripeService = new StripeService();
