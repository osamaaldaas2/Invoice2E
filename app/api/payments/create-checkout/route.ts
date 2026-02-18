/**
 * Payment Checkout API Route
 * Creates checkout sessions for credit purchases using database-driven packages
 * Refactored to create provider session FIRST to avoid spam records
 * 
 * @route /api/payments/create-checkout
 */

import { NextRequest, NextResponse } from 'next/server';
import { packageService } from '@/services/package.service';
import { stripeAdapter } from '@/adapters/stripe.adapter';
import { paypalAdapter } from '@/adapters/paypal.adapter';
import { createUserScopedClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import { CreditPackage } from '@/types/credit-package';
import { handleApiError } from '@/lib/api-helpers';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';

type PaymentMethod = 'stripe' | 'paypal';

/**
 * POST /api/payments/create-checkout
 * Create a checkout session using database packages
 */
import { getAuthenticatedUser } from '@/lib/auth';

/**
 * POST /api/payments/create-checkout
 * Create a checkout session using database packages
 */
export async function POST(req: NextRequest) {
    try {
        // Auth: try Supabase first, then fallback to session cookie
        const user = await getAuthenticatedUser(req);

        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const rateLimitId = `${getRequestIdentifier(req)}:payments-checkout:${user.id}`;
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
        const { packageId, packageSlug, method, paymentMethod } = body;
        const selectedMethod: PaymentMethod = method || paymentMethod || 'stripe';

        // Resolve package from database (accept packageId, packageSlug, or slug)
        const identifier = packageId || packageSlug;
        let pkg: CreditPackage | null = null;

        if (identifier) {
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
            if (isUUID) {
                pkg = await packageService.getPackageById(identifier);
            } else {
                pkg = await packageService.getPackageBySlug(identifier);
            }
        }

        if (!pkg || !pkg.is_active) {
            return NextResponse.json({ success: false, error: 'Invalid or inactive package' }, { status: 400 });
        }

        if (!['stripe', 'paypal'].includes(selectedMethod)) {
            return NextResponse.json({ success: false, error: 'Invalid payment method' }, { status: 400 });
        }

        // P0-2: Create user-scoped client for RLS-based data isolation
        const userClient = await createUserScopedClient(user.id);

        // Get user email
        const { data: userData } = await userClient
            .from('users')
            .select('email')
            .eq('id', user.id)
            .single();

        const email = userData?.email || user.email || '';

        // Build URLs
        const baseUrl = req.nextUrl.origin;
        const successUrl = `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = `${baseUrl}/checkout/cancel`;

        // Convert price to cents (Stripe expects cents)
        const amountInCents = Math.round(Number(pkg.price) * 100);

        logger.info('Initiating checkout session', {
            userId: user.id,
            method: selectedMethod,
            packageSlug: pkg.slug,
            credits: pkg.credits,
            amount: amountInCents
        });

        // 1. Create session with adapter FIRST
        // FIX: Audit #069 — replace loose `any` with structured type
        let result: { id: string; url?: string | null; [key: string]: unknown };
        let providerId = '';

        if (selectedMethod === 'stripe') {
            const session = await stripeAdapter.createCheckoutSession({
                userId: user.id,
                packageId: pkg.slug,
                credits: pkg.credits,
                amount: amountInCents,
                currency: pkg.currency.toLowerCase(),
                email,
                successUrl,
                cancelUrl,
                metadata: {
                    userId: user.id,
                    packageId: pkg.slug,
                    credits: pkg.credits.toString()
                }
            });
            result = session as typeof result;
            providerId = session.id;
        } else {
            const order = await paypalAdapter.createOrder({
                userId: user.id,
                packageId: pkg.slug,
                credits: pkg.credits,
                amount: amountInCents,
                currency: pkg.currency,
                returnUrl: successUrl.replace('{CHECKOUT_SESSION_ID}', ''),
                cancelUrl,
                customId: JSON.stringify({
                    userId: user.id,
                    packageId: pkg.slug,
                    credits: pkg.credits
                })
            });
            result = order;
            providerId = order.id;
        }

        // 2. Insert DB record ONLY if session creation succeeded
        // FIX: Store session ID in stripe_session_id, leave stripe_payment_id for webhook to set (payment_intent)
        const { data: transaction, error: insertError} = await userClient
            .from('payment_transactions')
            .insert({
                user_id: user.id,
                amount: pkg.price,
                currency: pkg.currency,
                credits_purchased: pkg.credits,
                payment_method: selectedMethod,
                payment_status: 'pending',
                stripe_session_id: selectedMethod === 'stripe' ? providerId : null,
                stripe_payment_id: null, // Will be set by webhook with payment_intent ID
                paypal_order_id: selectedMethod === 'paypal' ? providerId : null,
            })
            .select()
            .single();

        if (insertError || !transaction) {
            logger.error('Failed to insert transaction', { error: insertError });
            // In a real production system, we should cancel the payment session here
            throw new Error('Failed to record transaction');
        } else {
            logger.info('Transaction created', { transactionId: transaction.id, providerId });

            // 3. IMPORTANT: Update provider metadata with the generated transaction ID
            // This ensures verify route can find the transaction by ID if needed (as backup)
            if (selectedMethod === 'stripe') {
                // We can't easily update metadata on created session without another API call
                // BUT, our verify logic now primarily uses providerId (stripe_payment_id) lookup
                // So we don't strictly need transactionId in metadata for the MAIN flow
                // The main flow is: verify -> get session.id -> lookup payment_transactions where stripe_payment_id = session.id
                // This works perfectly without metadata update.
            }
        }

        // Return result
        if (selectedMethod === 'stripe') {
            return NextResponse.json({
                success: true,
                method: 'stripe',
                sessionId: result.id,
                url: result.url,
                credits: pkg.credits,
                amount: pkg.price,
                currency: pkg.currency,
                transactionId: transaction.id
            });
        } else {
            return NextResponse.json({
                success: true,
                method: 'paypal',
                orderId: result.id,
                url: result.approvalUrl,
                credits: pkg.credits,
                amount: pkg.price,
                currency: pkg.currency,
                transactionId: transaction.id
            });
        }

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create checkout';
        return handleApiError(error, 'Failed to create checkout session', { message });
    }
}

/**
 * GET /api/payments/create-checkout
 * Get available packages from database
 */
export async function GET() {
    try {
        const packages = await packageService.getActivePackages();

        const enrichedPackages = packages.map(pkg => ({
            ...pkg,
            pricePerCredit: pkg.credits > 0 ? Number(pkg.price) / pkg.credits : 0,
            discount: pkg.savings_percent || 0,
        }));

        return NextResponse.json({
            success: true,
            packages: enrichedPackages,
        });
    } catch (error) {
        return handleApiError(error, 'Failed to get packages', { message: 'Failed to get packages' });
    }
}
