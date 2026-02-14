import { API_TIMEOUTS } from '@/lib/constants';
import { logger } from '@/lib/logger';
import {
  IStripeAdapter,
  StripeCheckoutParams,
  StripeEvent,
  StripeRefund,
  StripeSession,
} from './interfaces';
import crypto from 'crypto';

export class StripeAdapter implements IStripeAdapter {
  private readonly apiKey: string;
  private readonly webhookSecret: string;
  private readonly apiUrl = 'https://api.stripe.com/v1';

  constructor(
    apiKey: string = process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: string = process.env.STRIPE_WEBHOOK_SECRET || ''
  ) {
    this.apiKey = apiKey;
    this.webhookSecret = webhookSecret;
  }

  async createCheckoutSession(params: StripeCheckoutParams): Promise<StripeSession> {
    if (!this.apiKey) {
      throw new Error('Stripe is not configured');
    }

    const bodyParams = new URLSearchParams();
    bodyParams.append('mode', 'payment');
    // FIX: Don't append session_id - the route already includes it in successUrl
    // Stripe automatically replaces {CHECKOUT_SESSION_ID} with the actual ID
    bodyParams.append('success_url', params.successUrl);
    bodyParams.append('cancel_url', params.cancelUrl);
    bodyParams.append('client_reference_id', params.userId);
    bodyParams.append('line_items[0][price_data][currency]', params.currency);
    bodyParams.append(
      'line_items[0][price_data][product_data][name]',
      `Invoice2E Credits - ${params.credits} pack`
    );
    bodyParams.append('line_items[0][price_data][unit_amount]', params.amount.toString());
    bodyParams.append('line_items[0][quantity]', '1');

    if (params.metadata) {
      Object.entries(params.metadata).forEach(([key, value]) => {
        bodyParams.append(`metadata[${key}]`, value);
      });
    }

    // Add default metadata if not present
    if (!params.metadata?.userId) bodyParams.append('metadata[userId]', params.userId);
    if (!params.metadata?.packageId) bodyParams.append('metadata[packageId]', params.packageId);
    if (!params.metadata?.credits)
      bodyParams.append('metadata[credits]', params.credits.toString());

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUTS.STRIPE_API);

    try {
      const response = await fetch(`${this.apiUrl}/checkout/sessions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: bodyParams,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        logger.error('Stripe checkout session creation failed', { error });
        throw new Error('Failed to create checkout session');
      }

      const session = await response.json();
      return {
        id: session.id,
        url: session.url,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        logger.error('Stripe API timeout');
        throw new Error('Stripe API timeout');
      }
      throw error;
    }
  }

  /**
   * SECURITY FIX (BUG-008): Implement proper HMAC-SHA256 signature verification
   * Based on Stripe's webhook signature verification algorithm
   */
  async constructWebhookEvent(payload: string, signature: string): Promise<StripeEvent> {
    if (!this.webhookSecret) {
      throw new Error('Stripe webhook secret not configured');
    }

    // Parse signature header parts
    const parts = signature.split(',');
    const timestamp = parts.find((p) => p.startsWith('t='))?.split('=')[1];
    const v1Signature = parts.find((p) => p.startsWith('v1='))?.split('=')[1];

    if (!timestamp) {
      logger.warn('Stripe webhook: Missing timestamp');
      throw new Error('Invalid signature: missing timestamp');
    }

    if (!v1Signature) {
      logger.warn('Stripe webhook: Missing v1 signature');
      throw new Error('Invalid signature: missing v1 signature');
    }

    // Check timestamp age (5 minutes tolerance)
    const timestampAge = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
    if (timestampAge > 300) {
      logger.warn('Stripe webhook: Timestamp too old', { age: timestampAge });
      throw new Error('Webhook timestamp too old');
    }

    // CRITICAL SECURITY FIX: Compute expected HMAC-SHA256 signature
    const signedPayload = `${timestamp}.${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(signedPayload, 'utf8')
      .digest('hex');

    // CRITICAL: Use timing-safe comparison to prevent timing attacks
    let signaturesMatch = false;
    try {
      signaturesMatch = crypto.timingSafeEqual(
        Buffer.from(v1Signature, 'utf8'),
        Buffer.from(expectedSignature, 'utf8')
      );
    } catch {
      // Buffers have different lengths, signatures don't match
      signaturesMatch = false;
    }

    if (!signaturesMatch) {
      logger.warn('Stripe webhook: Invalid signature', {
        receivedLength: v1Signature.length,
        expectedLength: expectedSignature.length,
      });
      throw new Error('Invalid webhook signature');
    }

    logger.info('Stripe webhook signature verified successfully');

    try {
      return JSON.parse(payload) as StripeEvent;
    } catch (e) {
      throw new Error('Invalid JSON payload');
    }
  }

  async refundPayment(paymentIntentId: string, amount?: number): Promise<StripeRefund> {
    if (!this.apiKey) {
      throw new Error('Stripe is not configured');
    }

    const bodyParams = new URLSearchParams();
    bodyParams.append('payment_intent', paymentIntentId);
    if (amount) {
      bodyParams.append('amount', amount.toString());
    }

    const response = await fetch(`${this.apiUrl}/refunds`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: bodyParams,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let errorMessage = 'Refund failed';

      try {
        const errorJson = JSON.parse(errorBody);
        const stripeError = errorJson.error;
        if (stripeError) {
          errorMessage = stripeError.message || stripeError.code || 'Unknown Stripe error';
          logger.error('Stripe refund API error', {
            paymentIntentId,
            code: stripeError.code,
            type: stripeError.type,
            message: stripeError.message,
            decline_code: stripeError.decline_code,
          });
        }
      } catch {
        logger.error('Stripe refund failed with non-JSON response', {
          paymentIntentId,
          status: response.status,
          body: errorBody,
        });
      }

      throw new Error(errorMessage);
    }

    const refund = await response.json();
    logger.info('Stripe refund successful', {
      refundId: refund.id,
      paymentIntentId,
      amount: refund.amount,
      status: refund.status,
    });

    return {
      id: refund.id,
      amount: refund.amount,
      status: refund.status,
    };
  }

  async retrieveCheckoutSession(sessionId: string): Promise<StripeSession> {
    if (!/^[a-zA-Z0-9_]+$/.test(sessionId) || sessionId.length > 255) {
      throw new Error('Invalid Stripe session ID format');
    }
    const response = await fetch(
      `${this.apiUrl}/checkout/sessions/${encodeURIComponent(sessionId)}`,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to retrieve session');
    }

    const session = await response.json();
    return {
      id: session.id,
      url: session.url,
      paymentIntentId: session.payment_intent,
      payment_status: session.payment_status,
      metadata: session.metadata,
    };
  }
}

export const stripeAdapter = new StripeAdapter();
