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
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
                { error: 'Session ID or Order ID is required' },
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
            // Idempotency guard: check transaction state and verify marker before mutating balances.
            const [transactionResult, verifyEventResult] = await Promise.all([
                supabase
                    .from('payment_transactions')
                    .select('id, payment_status, credits_purchased')
                    .eq('user_id', user.id)
                    .or(`stripe_session_id.eq.${paymentId},stripe_payment_id.eq.${paymentId},paypal_order_id.eq.${paymentId}`)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle(),
                supabase
                    .from('webhook_events')
                    .select('id')
                    .eq('event_id', `verify_${paymentId}`)
                    .maybeSingle(),
            ]);

            const transaction = transactionResult.data;
            const verifyEvent = verifyEventResult.data;

            if (verifyEvent) {
                logger.info('Payment already processed via verify marker', { paymentId, userId: user.id });
                return NextResponse.json({
                    success: true,
                    verified: true,
                    credits,
                    message: 'Already processed',
                });
            }

            if (!transaction) {
                logger.error('Transaction not found for payment', { paymentId, userId: user.id });
                // If not found, it might be a timing issue or manual call.
                // In strict mode we fail, but we could create it here if we trusted the provider enough.
                // For now, fail to alert admin/user.
                return NextResponse.json({
                    error: 'Transaction record not found',
                    code: 'TRANSACTION_NOT_FOUND'
                }, { status: 404 });
            }

            if (transaction.payment_status === 'completed') {
                logger.info('Payment already processed via transaction', { userId: user.id, paymentId });
                return NextResponse.json({
                    success: true,
                    verified: true,
                    credits,
                    message: 'Already processed',
                });
            }

            // Update transaction status using ID if available
            if (transaction.id) {
                const updateData: Record<string, unknown> = {
                    payment_status: 'completed',
                    updated_at: new Date().toISOString()
                };

                if (sessionId && stripePaymentIntentId) {
                    updateData.stripe_payment_id = stripePaymentIntentId;
                }

                const { error: updateError } = await supabase
                    .from('payment_transactions')
                    .update(updateData)
                    .eq('id', transaction.id)
                    .eq('user_id', user.id); // Security check

                if (updateError) {
                    logger.error('Failed to update transaction by ID', { transactionId: transaction.id, error: updateError });
                } else {
                    logger.info('Transaction updated by ID', { transactionId: transaction.id });
                }
            } else {
                // Fallback: Look up by provider ID (stripe_payment_id or paypal_order_id)
                // This is the main path for Stripe since we don't update metadata after creation
                logger.info('Updating transaction by provider ID', { paymentId, userId: user.id });

                const { data: pendingTx } = await supabase
                    .from('payment_transactions')
                    .select('id')
                    .eq('user_id', user.id)
                    .or(`stripe_session_id.eq.${paymentId},stripe_payment_id.eq.${paymentId},paypal_order_id.eq.${paymentId}`)
                    .eq('payment_status', 'pending')
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                if (pendingTx) {
                    const pendingUpdateData: Record<string, unknown> = {
                        payment_status: 'completed',
                        updated_at: new Date().toISOString()
                    };

                    if (sessionId && stripePaymentIntentId) {
                        pendingUpdateData.stripe_payment_id = stripePaymentIntentId;
                    }

                    await supabase
                        .from('payment_transactions')
                        .update(pendingUpdateData)
                        .eq('id', pendingTx.id);
                    logger.info('Transaction updated by provider ID', { transactionId: pendingTx.id });
                } else {
                    logger.warn('No pending transaction found for provider ID', { paymentId });
                }
            }

            // Add credits to user account using atomic RPC (BUG-016 fix)
            // Try atomic RPC first, fall back to direct update if RPC not available
            let creditAddSuccess = false;

            try {
                const { data: newBalance, error: rpcError } = await supabase.rpc('add_credits', {
                    p_user_id: user.id,
                    p_amount: credits,
                    p_source: 'payment_verify',
                    p_reference_id: paymentId,
                });

                if (!rpcError && newBalance !== null) {
                    creditAddSuccess = true;
                    logger.info('Credits added via atomic RPC', { userId: user.id, credits, newBalance, paymentId });
                } else if (rpcError) {
                    logger.warn('RPC add_credits failed, falling back to direct update', { error: rpcError.message });
                }
            } catch (rpcErr) {
                logger.warn('RPC add_credits not available, using fallback', { error: rpcErr });
            }

            // Fallback: Direct update if RPC failed
            if (!creditAddSuccess) {
                const { data: currentCredits } = await supabase
                    .from('user_credits')
                    .select('available_credits')
                    .eq('user_id', user.id)
                    .single();

                if (currentCredits) {
                    const { error: updateErr } = await supabase
                        .from('user_credits')
                        .update({ available_credits: currentCredits.available_credits + credits })
                        .eq('user_id', user.id);

                    if (updateErr) {
                        logger.error('Failed to update credits', { userId: user.id, error: updateErr });
                        throw new Error('Failed to add credits');
                    }
                } else {
                    const { error: insertErr } = await supabase
                        .from('user_credits')
                        .insert({ user_id: user.id, available_credits: credits });

                    if (insertErr) {
                        logger.error('Failed to create credits', { userId: user.id, error: insertErr });
                        throw new Error('Failed to create credits record');
                    }
                }
                logger.info('Credits added via fallback method', { userId: user.id, credits, paymentId });
            }

            // IDEMPOTENCY FIX: Record in webhook_events to prevent webhook from adding credits again
            // Use a unique event_id based on session/order ID with 'verify_' prefix
            const verifyEventId = `verify_${paymentId}`;
            await supabase.from('webhook_events').insert({
                event_id: verifyEventId,
                provider: sessionId ? 'stripe' : 'paypal',
                event_type: 'payment.verified',
                user_id: user.id,
                credits_added: credits,
            }).catch((err: unknown) => {
                // Don't fail if insert fails (might be duplicate), just log
                logger.warn('Failed to insert verify event (may be duplicate)', { error: err });
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
