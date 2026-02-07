export interface ExtractedInvoiceData {
    invoiceNumber: string | null;
    invoiceDate: string | null;
    buyerName: string | null;
    buyerEmail: string | null;
    buyerAddress: string | null;
    buyerTaxId: string | null;
    sellerName: string | null;
    sellerEmail: string | null;
    sellerAddress: string | null;
    sellerTaxId: string | null;
    sellerIban?: string | null;
    sellerBic?: string | null;
    bankName?: string | null;
    lineItems: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
        totalPrice: number;
        taxRate?: number;
    }>;
    subtotal: number;
    taxRate?: number | null;
    taxAmount: number;
    totalAmount: number;
    currency: string;
    paymentTerms: string | null;
    notes: string | null;
    confidence: number;
    processingTimeMs: number;
}

export interface IAIExtractor {
    extractFromFile(fileBuffer: Buffer, fileName: string, fileType: string): Promise<ExtractedInvoiceData>;

    getProviderName(): string;

    validateConfiguration(): boolean;
}
