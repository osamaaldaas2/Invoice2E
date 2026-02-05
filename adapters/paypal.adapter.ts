import { API_TIMEOUTS } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { IPayPalAdapter, PayPalCapture, PayPalOrder, PayPalOrderParams, PayPalRefund } from './interfaces';

export class PayPalAdapter implements IPayPalAdapter {
    private readonly clientId: string;
    private readonly clientSecret: string;
    private readonly apiUrl: string;
    private accessToken: string | null = null;
    private tokenExpiry: number = 0;

    constructor() {
        this.clientId = process.env.PAYPAL_CLIENT_ID || '';
        this.clientSecret = process.env.PAYPAL_CLIENT_SECRET || '';
        this.apiUrl = process.env.NODE_ENV === 'production'
            ? 'https://api-m.paypal.com'
            : 'https://api-m.sandbox.paypal.com';
    }

    private async getAccessToken(): Promise<string> {
        if (this.accessToken && Date.now() < this.tokenExpiry) {
            return this.accessToken;
        }

        const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUTS.PAYPAL_API);

        try {
            const response = await fetch(`${this.apiUrl}/v1/oauth2/token`, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: 'grant_type=client_credentials',
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error('Failed to get PayPal access token');
            }

            const data = await response.json();
            this.accessToken = data.access_token as string;
            this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;
            return this.accessToken;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error('PayPal API timeout');
            }
            throw error;
        }
    }

    async createOrder(params: PayPalOrderParams): Promise<PayPalOrder> {
        if (!this.clientId || !this.clientSecret) {
            throw new Error('PayPal is not configured');
        }

        const accessToken = await this.getAccessToken();
        const amount = (params.amount / 100).toFixed(2);

        const response = await fetch(`${this.apiUrl}/v2/checkout/orders`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                intent: 'CAPTURE',
                purchase_units: [{
                    reference_id: params.packageId,
                    custom_id: params.customId || JSON.stringify({ userId: params.userId, packageId: params.packageId, credits: params.credits }),
                    amount: {
                        currency_code: params.currency,
                        value: amount,
                    },
                }],
                application_context: {
                    brand_name: 'Invoice2E',
                    landing_page: 'BILLING',
                    user_action: 'PAY_NOW',
                    return_url: params.returnUrl,
                    cancel_url: params.cancelUrl,
                },
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            logger.error('PayPal order creation failed', { error });
            throw new Error('Failed to create PayPal order');
        }

        const order = await response.json();
        const approvalUrl = order.links?.find((l: { rel: string }) => l.rel === 'approve')?.href;

        if (!approvalUrl) {
            throw new Error('PayPal approval URL not found');
        }

        return {
            id: order.id,
            approvalUrl,
            status: order.status
        };
    }

    async captureOrder(orderId: string): Promise<PayPalCapture> {
        const accessToken = await this.getAccessToken();

        const response = await fetch(`${this.apiUrl}/v2/checkout/orders/${orderId}/capture`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error('Failed to capture payment');
        }

        const capture = await response.json();

        // Extract amount if possible, though strict interface just needs number
        const amount = capture.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value ||
            capture.purchase_units?.[0]?.amount?.value || 0;

        return {
            id: capture.id,
            status: capture.status,
            amount: Number(amount)
        };
    }

    async verifyWebhook(headers: Record<string, string>, body: string): Promise<boolean> {
        const webhookId = process.env.PAYPAL_WEBHOOK_ID;
        if (!webhookId) return false;

        const accessToken = await this.getAccessToken();

        const response = await fetch(`${this.apiUrl}/v1/notifications/verify-webhook-signature`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                auth_algo: headers['paypal-auth-algo'],
                cert_url: headers['paypal-cert-url'],
                transmission_id: headers['paypal-transmission-id'],
                transmission_sig: headers['paypal-transmission-sig'],
                transmission_time: headers['paypal-transmission-time'],
                webhook_id: webhookId,
                webhook_event: JSON.parse(body),
            }),
        });

        if (!response.ok) return false;

        const result = await response.json();
        return result.verification_status === 'SUCCESS';
    }

    async getOrder(orderId: string): Promise<PayPalOrder> {
        const accessToken = await this.getAccessToken();

        const response = await fetch(`${this.apiUrl}/v2/checkout/orders/${orderId}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });

        if (!response.ok) {
            throw new Error('Failed to get order');
        }

        const order = await response.json();
        // Construct approval url if exists (it might not if already captured)
        const approvalUrl = order.links?.find((l: { rel: string }) => l.rel === 'approve')?.href || '';
        const customId = order.purchase_units?.[0]?.custom_id;

        return {
            id: order.id,
            approvalUrl,
            status: order.status,
            customId
        };
    }

    /**
     * Refund a captured payment
     * PayPal requires the capture ID (not order ID) to process refunds
     */
    async refundCapture(captureId: string, amount?: number, currency?: string): Promise<PayPalRefund> {
        const accessToken = await this.getAccessToken();

        const body: Record<string, unknown> = {};
        if (amount !== undefined && currency) {
            // Partial refund with specific amount
            body.amount = {
                value: (amount / 100).toFixed(2),
                currency_code: currency,
            };
        }
        // If no amount specified, full refund is processed

        const response = await fetch(`${this.apiUrl}/v2/payments/captures/${captureId}/refund`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const error = await response.text();
            logger.error('PayPal refund failed', { error, captureId });
            throw new Error('Failed to process PayPal refund');
        }

        const refund = await response.json();
        const refundAmount = refund.amount?.value ? Number(refund.amount.value) * 100 : 0;

        return {
            id: refund.id,
            status: refund.status,
            amount: refundAmount,
        };
    }
}

export const paypalAdapter = new PayPalAdapter();
