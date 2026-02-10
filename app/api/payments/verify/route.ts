/**
 * Payment Verification API Route
 * Verifies payment and adds credits to user account
 * Refactored to lookup transaction by provider ID for guaranteed matching
 *
 * @route /api/payments/verify
 */

import { NextRequest, NextResponse } from 'next/server';
import { stripeAdapter } from '@/adapters/stripe.adapter';
import { paypalAdapter } from '@/adapters/paypal.adapter';
import { createServerClient } from '@/lib/supabase.server';
import { getSessionFromCookie } from '@/lib/session';
import { logger } from '@/lib/logger';
import { handleApiError } from '@/lib/api-helpers';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';
import { ValidationError } from '@/lib/errors';
import { creditsDbService } from '@/services/credits.db.service';

/**
 * POST /api/payments/verify
 * Verify payment and add credits if successful
 */
export async function POST(req: NextRequest) {
    try {
        // Use secure signed session token for authentication
        const session = await getSessionFromCookie();

        if (!session) {
            logger.warn('Payment verification attempted without valid session');
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        // Create user object from session
        const user = { id: session.userId, email: session.email };

        const rateLimitId = `${getRequestIdentifier(req)}:payments-verify:${user.id}`;
        const rateLimit = await checkRateLimitAsync(rateLimitId, 'api');
        if (!rateLimit.allowed) {
            return NextResponse.json(
                { success: false, error: `Too many requests. Try again in ${rateLimit.resetInSeconds} seconds.` },
                {
                    status: 429,
                    headers: { 'Retry-After': String(rateLimit.resetInSeconds) },
                }
            );
        }

        const body = await req.json();
        const { sessionId, orderId } = body;

        if (!sessionId && !orderId) {
            return NextResponse.json(
                { success: false, error: 'Session ID or Order ID is required' },
                { status: 400 }
            );
        }

        const supabase = createServerClient();
        let verified = false;
        let credits = 0;
        let paymentId = '';
        let stripePaymentIntentId: string | undefined;

        // Stripe verification
        if (sessionId) {
            try {
                const session = await stripeAdapter.retrieveCheckoutSession(sessionId);
                logger.info('Stripe session retrieved', {
                    sessionId,
                    paymentStatus: session.payment_status,
                    metadata: session.metadata
                });

                if (session.payment_status === 'paid' && session.metadata?.credits) {
                    verified = true;
                    credits = parseInt(session.metadata.credits, 10);
                    // Use paymentIntentId if available, otherwise fallback to session ID
                    // But for lookup, we MUST use what we stored.
                    // create-checkout stores session.id as stripe_session_id
                    paymentId = sessionId;
                    stripePaymentIntentId = session.paymentIntentId || (session as { payment_intent?: string }).payment_intent;
                }
            } catch (error) {
                logger.error('Stripe session verification failed', { sessionId, error });
            }
        }

        // PayPal verification
        if (orderId && !verified) {
            try {
                const order = await paypalAdapter.getOrder(orderId);
                // SECURITY FIX: Only accept COMPLETED status - APPROVED means payment not yet captured
                // APPROVED orders should be captured first before granting credits
                if (order.status === 'COMPLETED' && order.customId) {
                    let customData: { credits?: number | string };
                    try {
                        customData = JSON.parse(order.customId) as { credits?: number | string };
                    } catch (parseError) {
                        logger.error('Invalid JSON in PayPal order customId', {
                            orderId: order.id,
                            customId: order.customId,
                            parseError,
                        });
                        throw new ValidationError('Invalid payment data format');
                    }

                    const parsedCredits = Number(customData.credits || 0);
                    if (!Number.isFinite(parsedCredits) || parsedCredits < 0) {
                        logger.error('Invalid credits in PayPal order customId', {
                            orderId: order.id,
                            credits: customData.credits,
                        });
                        throw new ValidationError('Invalid payment credits value');
                    }

                    verified = true;
                    credits = parsedCredits;
                    paymentId = orderId;
                } else if (order.status === 'APPROVED') {
                    logger.warn('PayPal order is APPROVED but not COMPLETED - payment not yet captured', { orderId });
                    return NextResponse.json({
                        success: false,
                        verified: false,
                        message: 'Payment approved but not yet captured. Please complete the payment.',
                    });
                }
            } catch (error) {
                logger.error('PayPal order verification failed', { orderId, error });
            }
        }

        if (verified && credits > 0) {
            // Look up transaction for status update (record-keeping only)
            const { data: transaction } = await supabase
                .from('payment_transactions')
                .select('id, payment_status')
                .eq('user_id', user.id)
                .or(`stripe_session_id.eq.${paymentId},stripe_payment_id.eq.${paymentId},paypal_order_id.eq.${paymentId}`)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (!transaction) {
                logger.error('Transaction not found for payment', { paymentId, userId: user.id });
                return NextResponse.json({
                    success: false,
                    error: 'Transaction record not found',
                    code: 'TRANSACTION_NOT_FOUND'
                }, { status: 404 });
            }

            // Check for expired transaction
            if (transaction.payment_status === 'expired') {
                logger.warn('Attempt to verify expired transaction', { paymentId, userId: user.id });
                return NextResponse.json({
                    success: false,
                    error: 'This payment has expired. Please start a new checkout.',
                }, { status: 410 });
            }

            // Atomic credit addition with idempotency — single RPC call replaces
            // separate idempotency check + add_credits + webhook_events insert
            const verifyResult = await creditsDbService.verifyAndAddCredits(
                user.id,
                credits,
                `verify_${paymentId}`,
                sessionId ? 'stripe' : 'paypal',
                'payment.verified',
                paymentId,
            );

            if (verifyResult.alreadyProcessed) {
                logger.info('Payment already processed via atomic verify', { paymentId, userId: user.id });
                return NextResponse.json({
                    success: true,
                    verified: true,
                    credits,
                    message: 'Already processed',
                });
            }

            // Update transaction status (record-keeping, not credit-critical)
            if (transaction.id && transaction.payment_status !== 'completed') {
                const updateData: Record<string, unknown> = {
                    payment_status: 'completed',
                    updated_at: new Date().toISOString(),
                };
                if (sessionId && stripePaymentIntentId) {
                    updateData.stripe_payment_id = stripePaymentIntentId;
                }
                const { error: updateError } = await supabase
                    .from('payment_transactions')
                    .update(updateData)
                    .eq('id', transaction.id)
                    .eq('user_id', user.id);

                if (updateError) {
                    logger.error('Failed to update transaction status', { transactionId: transaction.id, error: updateError });
                }
            }

            logger.info('Credits added via atomic verify_and_add_credits', {
                userId: user.id, credits, paymentId, newBalance: verifyResult.newBalance,
            });

            return NextResponse.json({
                success: true,
                verified: true,
                credits,
                message: 'Credits added to your account',
            });
        }

        // Not verified or no credits
        return NextResponse.json({
            success: true,
            verified: false,
            message: 'Payment is still processing or not found',
        });

    } catch (error) {
        return handleApiError(error, 'Payment verification failed', {
            message: 'Verification failed'
        });
    }
}
