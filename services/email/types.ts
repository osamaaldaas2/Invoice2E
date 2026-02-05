export interface EmailOptions {
    to: string;
    subject: string;
    html: string;
    text?: string;
    attachments?: Array<{
        content: string; // base64 encoded
        filename: string;
        type: string;
    }>;
}

export interface ConversionEmailData {
    invoiceNumber: string;
    invoiceDate: string;
    buyerName: string;
    totalAmount: number;
    currency: string;
    format: string;
    downloadLink: string;
}

export interface PaymentEmailData {
    creditsPurchased: number;
    amountPaid: number;
    currency: string;
    availableCredits: number;
    receiptUrl?: string;
}
