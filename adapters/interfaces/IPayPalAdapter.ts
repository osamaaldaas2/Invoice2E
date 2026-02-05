export interface IPayPalAdapter {
    createOrder(params: PayPalOrderParams): Promise<PayPalOrder>;
    captureOrder(orderId: string): Promise<PayPalCapture>;
    verifyWebhook(headers: Record<string, string>, body: string): Promise<boolean>;
    getOrder(orderId: string): Promise<PayPalOrder>;
    refundCapture(captureId: string, amount?: number, currency?: string): Promise<PayPalRefund>;
}

export interface PayPalOrderParams {
    userId: string;
    packageId: string;
    credits: number;
    amount: number;
    currency: string;
    returnUrl: string;
    cancelUrl: string;
    customId?: string;
}

export interface PayPalOrder {
    id: string;
    approvalUrl: string;
    status: string;
    customId?: string;
}

export interface PayPalCapture {
    id: string;
    status: string;
    amount: number;
    customId?: string;
}

export interface PayPalRefund {
    id: string;
    status: string;
    amount: number;
}
