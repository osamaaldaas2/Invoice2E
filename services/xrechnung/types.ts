export interface XRechnungGenerationResult {
    xmlContent: string;
    fileName: string;
    fileSize: number;
    validationStatus: 'valid' | 'invalid' | 'warnings';
    validationErrors: string[];
    validationWarnings: string[];
}

// FIX-019: Typed interface replacing `any` in XRechnung builder
export interface XRechnungLineItem {
    description?: string;
    name?: string;
    quantity?: number;
    unitPrice?: number;
    totalPrice?: number;
    lineTotal?: number;
    taxRate?: number;
    vatRate?: number;
    unitCode?: string;
}

export interface XRechnungInvoiceData {
    invoiceNumber: string;
    invoiceDate: string;
    buyerName?: string | null;
    buyerEmail?: string | null;
    buyerAddress?: string | null;
    buyerCity?: string | null;
    buyerPostalCode?: string | null;
    buyerCountryCode?: string | null;
    buyerReference?: string | null;
    sellerName: string;
    sellerEmail?: string | null;
    sellerAddress?: string | null;
    sellerCity?: string | null;
    sellerPostalCode?: string | null;
    sellerCountryCode?: string | null;
    sellerTaxId?: string | null;
    sellerIban?: string | null;
    sellerBic?: string | null;
    sellerContactName?: string | null;
    sellerContact?: string | null;
    sellerPhoneNumber?: string | null;
    sellerPhone?: string | null;
    supplierName?: string | null;
    supplierEmail?: string | null;
    supplierAddress?: string | null;
    supplierTaxId?: string | null;
    iban?: string | null;
    bic?: string | null;
    lineItems?: XRechnungLineItem[];
    items?: XRechnungLineItem[];
    subtotal?: number | null;
    taxRate?: number | null;
    vatRate?: number | null;
    taxAmount?: number | null;
    totalAmount: number;
    currency?: string | null;
    paymentTerms?: string | null;
    paymentDueDate?: string | null;
    notes?: string | null;
    dueDate?: string | null;
    [key: string]: unknown;
}
