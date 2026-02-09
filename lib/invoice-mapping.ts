/**
 * Centralized mapping from review form data to service data format.
 * FIX-023: Single source of truth for field name mapping.
 */

export interface ReviewFormData {
    invoiceNumber?: string;
    invoiceDate?: string;
    sellerName?: string;
    sellerEmail?: string;
    sellerAddress?: string;
    sellerCity?: string;
    sellerPostalCode?: string;
    sellerCountryCode?: string;
    sellerTaxId?: string;
    sellerIban?: string;
    sellerBic?: string;
    sellerPhone?: string;
    buyerName?: string;
    buyerEmail?: string;
    buyerAddress?: string;
    buyerCity?: string;
    buyerPostalCode?: string;
    buyerCountryCode?: string;
    buyerPhone?: string;
    buyerReference?: string;
    lineItems?: Array<{
        description?: string;
        quantity?: number;
        unitPrice?: number;
        totalPrice?: number;
        lineTotal?: number;
        taxRate?: number;
        unitCode?: string;
    }>;
    subtotal?: number;
    taxRate?: number;
    taxAmount?: number;
    totalAmount?: number;
    currency?: string;
    paymentTerms?: string;
    paymentDueDate?: string;
    dueDate?: string;
    notes?: string;
    [key: string]: unknown;
}

export function mapReviewDataToServiceData(reviewData: ReviewFormData): ReviewFormData {
    return {
        ...reviewData,
    };
}
