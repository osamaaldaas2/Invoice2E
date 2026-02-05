export interface IStripeAdapter {
    createCheckoutSession(params: StripeCheckoutParams): Promise<StripeSession>;
    constructWebhookEvent(payload: string, signature: string): Promise<StripeEvent>;
    refundPayment(paymentIntentId: string, amount?: number): Promise<StripeRefund>;
    retrieveCheckoutSession(sessionId: string): Promise<StripeSession>;
}

export interface StripeCheckoutParams {
    userId: string;
    email: string;
    packageId: string;
    credits: number;
    amount: number;
    currency: string;
    successUrl: string;
    cancelUrl: string;
    metadata?: Record<string, string>;
}

export interface StripeSession {
    id: string;
    url: string;
    paymentIntentId?: string;
    payment_status?: string;
    metadata?: Record<string, string>;
}

export interface StripeEvent {
    type: string;
    data: {
        object: unknown;
    };
}

export interface StripeRefund {
    id: string;
    amount: number;
    status: string;
}
