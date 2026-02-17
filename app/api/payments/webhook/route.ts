/**
 * Payment Webhook API Route
 * Handles webhooks from Stripe and PayPal
 * 
 * @route /api/payments/webhook
 */

import { NextRequest, NextResponse } from 'next/server';
import { paymentProcessor } from '@/services/payment-processor';
import { stripeService } from '@/services/stripe.service';
import { paypalService } from '@/services/paypal.service';
import { logger } from '@/lib/logger';
import { handleApiError } from '@/lib/api-helpers';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';

export const maxDuration = 60;

/**
 * POST /api/payments/webhook
 * Handle payment provider webhooks
 */
export async function POST(req: NextRequest) {
    try {
        const providerParam = req.nextUrl.searchParams.get('provider') || 'stripe';
        const provider = providerParam === 'stripe' || providerParam === 'paypal'
            ? providerParam
            : 'stripe';
        if (providerParam !== provider) {
            logger.warn('Invalid provider parameter', { provided: providerParam });
        }

        // FIX: Audit #052 — removed rate limiting from payment webhooks.
        // Payment providers (Stripe/PayPal) send bursts of webhooks during
        // subscription renewals. Signature verification is the security mechanism.

        const body = await req.text();

        logger.info('Received payment webhook', { provider });

        if (provider === 'stripe') {
            // Verify Stripe signature
            const signature = req.headers.get('stripe-signature') || '';

            // SECURITY FIX: Must await async verification - otherwise Promise is always truthy
            if (!(await stripeService.verifyWebhookSignature(body, signature))) {
                logger.warn('Invalid Stripe webhook signature - rejecting request');
                return NextResponse.json(
                    { error: 'Invalid signature' },
                    { status: 400 }
                );
            }

            let event: { type: string; id: string; data: { object: Record<string, unknown> } };
            try {
                event = JSON.parse(body) as { type: string; id: string; data: { object: Record<string, unknown> } };
            } catch (parseError) {
                logger.error('Invalid webhook JSON payload', { provider, parseError });
                return NextResponse.json(
                    { error: 'Invalid JSON payload' },
                    { status: 400 }
                );
            }

            const result = await paymentProcessor.handleStripeWebhook(event);

            if (!result.success) {
                logger.error('Stripe webhook processing failed', { message: result.message });
                return NextResponse.json(
                    { error: result.message },
                    { status: 400 }
                );
            }

            logger.info('Stripe webhook processed successfully', {
                userId: result.userId,
                credits: result.credits
            });

            return NextResponse.json({ received: true });
        }

        if (provider === 'paypal') {
            // Get PayPal headers for verification
            const headers: Record<string, string> = {};
            req.headers.forEach((value, key) => {
                headers[key] = value;
            });

            // SECURITY FIX (BUG-009): Reject invalid PayPal signatures - fail closed
            const isValid = await paypalService.verifyWebhookSignature(headers, body);

            if (!isValid) {
                logger.warn('Invalid PayPal webhook signature - rejecting request', {
                    headerKeys: Object.keys(headers),
                });
                // CRITICAL: Reject invalid signatures, do NOT continue processing
                return NextResponse.json(
                    { error: 'Invalid webhook signature' },
                    { status: 401 }
                );
            }

            let event: { id?: string; event_type: string; resource: Record<string, unknown> };
            try {
                event = JSON.parse(body) as { id?: string; event_type: string; resource: Record<string, unknown> };
            } catch (parseError) {
                logger.error('Invalid webhook JSON payload', { provider, parseError });
                return NextResponse.json(
                    { error: 'Invalid JSON payload' },
                    { status: 400 }
                );
            }

            const result = await paymentProcessor.handlePaypalWebhook(event);

            if (!result.success) {
                logger.error('PayPal webhook processing failed', { message: result.message });
                return NextResponse.json(
                    { error: result.message },
                    { status: 400 }
                );
            }

            logger.info('PayPal webhook processed successfully', {
                userId: result.userId,
                credits: result.credits
            });

            return NextResponse.json({ received: true });
        }

        return NextResponse.json(
            { error: 'Unknown provider' },
            { status: 400 }
        );
    } catch (error) {
        return handleApiError(error, 'Webhook processing error', {
            message: 'Webhook processing failed'
        });
    }
}
