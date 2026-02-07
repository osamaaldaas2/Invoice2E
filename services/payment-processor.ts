/**
 * Payment Processor Service
 * Routes payment requests to appropriate provider (Stripe or PayPal)
 * 
 * @module services/payment-processor
 */

import { createServerClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import { stripeService, CREDIT_PACKAGES } from './stripe.service';
import { paypalService } from './paypal.service';
import { emailService } from './email.service';
import { ValidationError } from '@/lib/errors';

export type PaymentMethod = 'stripe' | 'paypal';

export interface PaymentSession {
    method: PaymentMethod;
    sessionId?: string;
    orderId?: string;
    url: string;
    credits: number;
    amount: number;
    currency: string;
}

export interface WebhookResult {
    success: boolean;
    userId?: string;
    credits?: number;
    message?: string;
}

export class PaymentProcessor {
    /**
     * Get available credit packages
     */
    getPackages() {
        return CREDIT_PACKAGES.map(pkg => ({
            id: pkg.id,
            name: pkg.name,
            credits: pkg.credits,
            price: pkg.price / 100, // Convert cents to currency
            currency: pkg.currency,
            discount: pkg.discount,
            pricePerCredit: (pkg.price / 100) / pkg.credits,
        }));
    }

    /**
     * Process payment through selected provider
     */
    async processPayment(
        method: PaymentMethod,
        userId: string,
        packageId: string,
        email: string,
        successUrl: string,
        cancelUrl: string
    ): Promise<PaymentSession> {
        logger.info('Processing payment', { method, userId, packageId });

        const pkg = CREDIT_PACKAGES.find(p => p.id === packageId);
        if (!pkg) {
            throw new ValidationError(`Invalid package: ${packageId}`);
        }

        // Create pending transaction record
        // FIX (QA-BUG-5): Check for insertion errors before proceeding
        const supabase = createServerClient();
        const { error: insertError } = await supabase.from('payment_transactions').insert({
            user_id: userId,
            amount: pkg.price / 100,
            currency: pkg.currency,
            credits_purchased: pkg.credits,
            payment_method: method,
            payment_status: 'pending',
            email,
        });

        if (insertError) {
            logger.error('Failed to create payment transaction', {
                userId,
                packageId,
                error: insertError.message
            });
            throw new Error('Unable to start payment process. Please try again.');
        }

        if (method === 'stripe') {
            if (!stripeService.isConfigured()) {
                throw new Error('Stripe is not configured');
            }

            const session = await stripeService.createCheckoutSession(
                userId,
                packageId,
                email,
                successUrl,
                cancelUrl
            );

            return {
                method: 'stripe',
                sessionId: session.sessionId,
                url: session.url,
                credits: pkg.credits,
                amount: pkg.price / 100,
                currency: pkg.currency,
            };
        } else if (method === 'paypal') {
            if (!paypalService.isConfigured()) {
                throw new Error('PayPal is not configured');
            }

            const order = await paypalService.createOrder(
                userId,
                packageId,
                successUrl,
                cancelUrl
            );

            return {
                method: 'paypal',
                orderId: order.orderId,
                url: order.approvalUrl,
                credits: pkg.credits,
                amount: pkg.price / 100,
                currency: pkg.currency,
            };
        }

        throw new Error(`Unsupported payment method: ${method}`);
    }

    /**
     * Handle Stripe webhook event
     * SECURITY FIX (BUG-004): Added idempotency check to prevent duplicate credit allocation
     * SECURITY FIX (BUG-032): Fixed metadata key lookup (userId, not user_id)
     */
    async handleStripeWebhook(event: { type: string; id: string; data: { object: Record<string, unknown> } }): Promise<WebhookResult> {
        const eventId = event.id;
        logger.info('Handling Stripe webhook', { type: event.type, eventId });

        if (event.type !== 'checkout.session.completed') {
            return { success: true, message: 'Event type ignored' };
        }

        const supabase = createServerClient();

        // SECURITY FIX (BUG-004): Check if this webhook has already been processed
        const { data: existingEvent } = await supabase
            .from('webhook_events')
            .select('id')
            .eq('event_id', eventId)
            .eq('provider', 'stripe')
            .single();

        if (existingEvent) {
            logger.info('Webhook already processed, skipping', { eventId });
            return { success: true, message: 'Already processed' };
        }

        const session = event.data.object;
        const metadata = (session.metadata || {}) as Record<string, string>;
        // SECURITY FIX (BUG-032): Try both userId and user_id for backwards compatibility
        const userId = metadata.userId || metadata.user_id;
        const credits = parseInt(metadata.credits || '0', 10);
        const paymentIntent = session.payment_intent as string;

        if (!userId || !credits) {
            logger.error('Missing userId or credits in webhook metadata', { metadata });
            return { success: false, message: 'Missing metadata' };
        }

        // Get the checkout session ID for idempotency checks
        const sessionId = session.id as string;

        // IDEMPOTENCY FIX #1: Check if verify already processed this payment
        // Verify inserts `verify_{sessionId}` into webhook_events
        if (sessionId) {
            const { data: verifyEvent } = await supabase
                .from('webhook_events')
                .select('id')
                .eq('event_id', `verify_${sessionId}`)
                .single();

            if (verifyEvent) {
                logger.info('Payment already processed by verify endpoint, skipping webhook credit addition', {
                    eventId,
                    sessionId,
                    userId
                });
                return { success: true, message: 'Already processed by verify' };
            }
        }

        // IDEMPOTENCY FIX #2: Check transaction status by session ID (no time window)
        // This catches cases where verify completed but webhook_events insert failed
        if (sessionId) {
            const { data: existingTx } = await supabase
                .from('payment_transactions')
                .select('id, payment_status')
                .eq('stripe_session_id', sessionId)
                .single();

            if (existingTx?.payment_status === 'completed') {
                logger.info('Transaction already completed, skipping credit addition', {
                    eventId,
                    sessionId,
                    transactionId: existingTx.id
                });
                return { success: true, message: 'Transaction already completed' };
            }
        }

        // Add credits to user using atomic RPC
        await this.addCreditsToUser(userId, credits, 'stripe', paymentIntent);

        // Record the processed webhook event for idempotency
        await supabase.from('webhook_events').insert({
            event_id: eventId,
            provider: 'stripe',
            event_type: event.type,
            user_id: userId,
            credits_added: credits,
            payment_amount: (session.amount_total as number) / 100,
            currency: (session.currency as string || 'EUR').toUpperCase(),
        });

        // Update transaction status
        await supabase
            .from('payment_transactions')
            .update({
                payment_status: 'completed',
                stripe_payment_id: paymentIntent,
            })
            .eq('user_id', userId)
            .eq('payment_status', 'pending')
            .eq('payment_method', 'stripe');

        // Send confirmation email
        const { data: userData } = await supabase
            .from('users')
            .select('email')
            .eq('id', userId)
            .single();

        if (userData?.email) {
            const { data: creditData } = await supabase
                .from('user_credits')
                .select('available_credits')
                .eq('user_id', userId)
                .single();

            await emailService.sendPaymentConfirmationEmail(userData.email, {
                creditsPurchased: credits,
                amountPaid: (session.amount_total as number) / 100,
                currency: (session.currency as string || 'EUR').toUpperCase(),
                availableCredits: creditData?.available_credits || credits,
            });
        }

        return { success: true, userId, credits };
    }

    /**
     * Handle PayPal webhook event
     * SECURITY FIX (BUG-004): Added idempotency check to prevent duplicate credit allocation
     */
    async handlePaypalWebhook(event: { id?: string; event_type: string; resource: Record<string, unknown> }): Promise<WebhookResult> {
        const eventId = event.id || (event.resource.id as string);
        logger.info('Handling PayPal webhook', { type: event.event_type, eventId });

        if (event.event_type !== 'CHECKOUT.ORDER.APPROVED') {
            return { success: true, message: 'Event type ignored' };
        }

        const supabase = createServerClient();

        // SECURITY FIX (BUG-004): Check if this webhook has already been processed
        const { data: existingEvent } = await supabase
            .from('webhook_events')
            .select('id')
            .eq('event_id', eventId)
            .eq('provider', 'paypal')
            .single();

        if (existingEvent) {
            logger.info('Webhook already processed, skipping', { eventId });
            return { success: true, message: 'Already processed' };
        }

        const orderId = event.resource.id as string;

        // Capture the payment
        const result = await paypalService.captureOrder(orderId);

        if (!result.success) {
            logger.error('PayPal capture failed', { error: result.error });
            return { success: false, message: result.error };
        }

        // Extract user info from custom_id
        let userId = '';
        let credits = result.credits || 0;
        try {
            const purchaseUnits = event.resource.purchase_units as Array<{ custom_id?: string }> | undefined;
            const customId = purchaseUnits?.[0]?.custom_id;
            const customData = JSON.parse(customId || '{}');
            userId = customData.userId;
            // Also try to get credits from custom data if not in result
            if (!credits && customData.credits) {
                credits = parseInt(customData.credits, 10);
            }
        } catch {
            logger.error('Failed to parse PayPal custom_id');
            return { success: false, message: 'Invalid custom data' };
        }

        if (!userId) {
            return { success: false, message: 'Missing user ID' };
        }

        // SECURITY FIX (BUG-045): Validate credits is positive
        if (!credits || credits <= 0) {
            logger.error('Invalid credits amount from PayPal', { credits, orderId });
            return { success: false, message: 'Invalid credits amount' };
        }

        // IDEMPOTENCY FIX #1: Check if verify already processed this payment
        // Verify inserts `verify_{orderId}` into webhook_events
        const { data: verifyEvent } = await supabase
            .from('webhook_events')
            .select('id')
            .eq('event_id', `verify_${orderId}`)
            .single();

        if (verifyEvent) {
            logger.info('Payment already processed by verify endpoint, skipping webhook credit addition', {
                eventId,
                orderId,
                userId
            });
            return { success: true, message: 'Already processed by verify' };
        }

        // IDEMPOTENCY FIX #2: Check transaction status by order ID (no time window)
        // This catches cases where verify completed but webhook_events insert failed
        const { data: existingTx } = await supabase
            .from('payment_transactions')
            .select('id, payment_status')
            .eq('paypal_order_id', orderId)
            .single();

        if (existingTx?.payment_status === 'completed') {
            logger.info('Transaction already completed, skipping credit addition', {
                eventId,
                orderId,
                transactionId: existingTx.id
            });
            return { success: true, message: 'Transaction already completed' };
        }

        // Add credits using atomic RPC
        await this.addCreditsToUser(userId, credits, 'paypal', orderId);

        // Record the processed webhook event for idempotency
        await supabase.from('webhook_events').insert({
            event_id: eventId,
            provider: 'paypal',
            event_type: event.event_type,
            user_id: userId,
            credits_added: credits,
        });

        // Update transaction
        await supabase
            .from('payment_transactions')
            .update({
                payment_status: 'completed',
                paypal_order_id: orderId,
            })
            .eq('user_id', userId)
            .eq('payment_status', 'pending')
            .eq('payment_method', 'paypal');

        return { success: true, userId, credits };
    }

    /**
     * Add credits to user account
     * SECURITY FIX (BUG-006): Use atomic RPC to prevent race conditions
     */
    async addCreditsToUser(
        userId: string,
        credits: number,
        source: string,
        referenceId?: string
    ): Promise<void> {
        logger.info('Adding credits to user atomically', { userId, credits, source });

        const supabase = createServerClient();

        // SECURITY FIX: Use atomic RPC function to prevent race conditions
        // The RPC function handles upsert and audit logging in a single transaction
        const { data: newBalance, error } = await supabase.rpc('add_credits', {
            p_user_id: userId,
            p_amount: credits,
            p_source: source,
            p_reference_id: referenceId || null,
        });

        if (error) {
            logger.error('Failed to add credits atomically', {
                userId,
                credits,
                source,
                error: error.message,
            });
            throw new Error(`Failed to add credits: ${error.message}`);
        }

        logger.info('Credits added successfully via atomic operation', {
            userId,
            credits,
            newBalance,
        });
    }

    /**
     * Get user's payment history
     */
    async getPaymentHistory(userId: string, page: number = 1, limit: number = 20) {
        const supabase = createServerClient();
        const offset = (page - 1) * limit;

        const { data, count, error } = await supabase
            .from('payment_transactions')
            .select('*', { count: 'exact' })
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            throw new Error(`Failed to get payment history: ${error.message}`);
        }

        return {
            transactions: data || [],
            total: count || 0,
            page,
            limit,
        };
    }
}

// Export singleton instance
export const paymentProcessor = new PaymentProcessor();
