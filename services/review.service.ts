
import { ValidationError } from '@/lib/errors';

export type LineItem = {
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    taxRate?: number;
};

export type ReviewedInvoiceData = {
    // Required EN16931 fields
    invoiceNumber: string;
    invoiceDate: string;

    // Buyer information (with country code)
    buyerName: string;
    buyerEmail: string;
    buyerAddress: string;
    buyerCity: string;
    buyerPostalCode: string;
    buyerCountryCode: string; // NEW: Required by BR-11
    buyerTaxId: string;
    buyerReference?: string; // NEW: Required by BR-DE-15
    buyerContact?: string; // NEW: Phone/name

    // Seller information (with country code and contact)
    sellerName: string;
    sellerEmail: string;
    sellerAddress: string;
    sellerCity: string; // NEW: Required by BR-DE-3
    sellerPostalCode: string; // NEW: Required by BR-DE-4
    sellerCountryCode: string; // NEW: Required by BR-09
    sellerTaxId: string;
    sellerContact?: string; // NEW: Required by BR-DE-2 (phone/name)

    // Line items
    lineItems: LineItem[];

    // Totals
    subtotal: number;
    taxAmount: number;
    totalAmount: number;
    currency: string;

    // Payment information
    paymentTerms: string;
    paymentDueDate?: string; // NEW: For BR-CO-25
    paymentInstructions?: string; // NEW: Required by BR-DE-1

    notes: string;
};

/**
 * Service for validating and processing reviewed invoice data
 * Follows CONSTITUTION rules for validation and logging
 */
export class ReviewService {
    /**
     * Validate reviewed invoice data
     */
    validateReviewedData(data: ReviewedInvoiceData): boolean {
        // Validate required string fields
        if (!data.invoiceNumber?.trim()) throw new ValidationError('Invoice number is required');
        if (!data.invoiceDate?.trim()) throw new ValidationError('Invoice date is required');
        if (!data.buyerName?.trim()) throw new ValidationError('Buyer name is required');
        if (!data.sellerName?.trim()) throw new ValidationError('Seller name is required');

        // Validate new required fields for XRechnung
        if (!data.sellerCountryCode?.trim()) throw new ValidationError('Seller country code is required');
        if (!data.buyerCountryCode?.trim()) throw new ValidationError('Buyer country code is required');
        if (!data.sellerCity?.trim()) throw new ValidationError('Seller city is required');
        if (!data.sellerPostalCode?.trim()) throw new ValidationError('Seller postal code is required');

        // Validate amounts are non-negative
        if (data.totalAmount < 0 || data.subtotal < 0 || data.taxAmount < 0) {
            throw new ValidationError('Amounts cannot be negative');
        }

        // Validate line items
        if (!Array.isArray(data.lineItems) || data.lineItems.length === 0) {
            throw new ValidationError('Invoice must have at least one line item');
        }

        for (const item of data.lineItems) {
            if (!item.description?.trim()) throw new ValidationError('Each line item must have a description');
            if (item.quantity <= 0) throw new ValidationError('Quantity must be greater than 0');
            if (item.unitPrice < 0) throw new ValidationError('Unit price cannot be negative'); // Allow 0 for free items? Test expects rejection of 0
            if (item.unitPrice === 0) throw new ValidationError('Unit price must be greater than 0');
            if (item.totalPrice < 0) throw new ValidationError('Total price cannot be negative');
        }

        // Validate date format (YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(data.invoiceDate)) {
            throw new ValidationError('Invoice date must be in YYYY-MM-DD format');
        }

        // Validate email format if provided
        if (data.buyerEmail && !this.isValidEmail(data.buyerEmail)) throw new ValidationError('Invalid buyer email format');
        if (data.sellerEmail && !this.isValidEmail(data.sellerEmail)) throw new ValidationError('Invalid seller email format');

        return true;
    }

    /**
     * Validate email format
     */
    private isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Track changes between original and reviewed data
     */
    trackChanges(original: Record<string, unknown>, reviewed: ReviewedInvoiceData): string[] {
        const changes: string[] = [];

        if (original.invoiceNumber !== reviewed.invoiceNumber) changes.push('Invoice number');
        if (original.invoiceDate !== reviewed.invoiceDate) changes.push('Invoice date');
        if (original.buyerName !== reviewed.buyerName) changes.push('Buyer name');
        if (original.supplierName !== reviewed.sellerName) changes.push('Seller name');

        const originalTotal = Number(original.totalAmount) || 0;
        if (Math.abs(originalTotal - reviewed.totalAmount) > 0.01) changes.push('Total amount');

        const originalItems = Array.isArray(original.items) ? original.items : [];
        if (originalItems.length !== reviewed.lineItems.length) changes.push('Line items count');

        // Track new fields if they differ from original (assuming original might have them if revisited)
        if (reviewed.buyerReference && original.buyerReference !== reviewed.buyerReference) changes.push('Buyer reference');
        if (reviewed.paymentInstructions && original.paymentInstructions !== reviewed.paymentInstructions) changes.push('Payment instructions');

        return changes;
    }

    /**
     * Calculate extraction accuracy based on changes made
     */
    calculateAccuracy(original: Record<string, unknown>, reviewed: ReviewedInvoiceData): number {
        const changes = this.trackChanges(original, reviewed);
        const totalFields = 20; // Increased count with new XRechnung fields
        const accuracy = ((totalFields - changes.length) / totalFields) * 100;
        return Math.max(0, Math.min(100, Math.round(accuracy * 10) / 10));
    }

    /**
     * Calculate line item totals
     */
    recalculateTotals(lineItems: LineItem[]): { subtotal: number; taxAmount: number; totalAmount: number } {
        const subtotal = lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
        const taxAmount = lineItems.reduce((sum, item) => {
            const taxRate = item.taxRate || 0;
            return sum + (item.totalPrice * taxRate / 100);
        }, 0);
        const totalAmount = subtotal + taxAmount;

        return {
            subtotal: Math.round(subtotal * 100) / 100,
            taxAmount: Math.round(taxAmount * 100) / 100,
            totalAmount: Math.round(totalAmount * 100) / 100,
        };
    }

    /**
     * Extract country code from tax ID
     */
    extractCountryFromTaxId(taxId: string): string {
        if (!taxId) return 'DE';
        // German: DE, Austrian: AT, Swiss: CH, etc
        if (taxId.startsWith('DE')) return 'DE';
        if (taxId.startsWith('AT')) return 'AT';
        if (taxId.startsWith('CH')) return 'CH';
        if (taxId.startsWith('FR')) return 'FR';
        if (taxId.startsWith('IT')) return 'IT';
        if (taxId.startsWith('ES')) return 'ES';
        if (taxId.startsWith('NL')) return 'NL';
        if (taxId.startsWith('BE')) return 'BE';
        return 'DE'; // Default to Germany
    }

    /**
     * Parse address into city and postal code
     */
    parseAddress(addressLine: string): { city: string; postalCode: string } {
        if (!addressLine) return { city: '', postalCode: '' };

        const lines = addressLine.split('\n').map(l => l.trim()).filter(l => l);

        if (lines.length === 0) {
            return { city: '', postalCode: '' };
        }

        // Last line usually contains postal code and city
        const lastLine = lines[lines.length - 1];
        if (!lastLine) {
            return { city: '', postalCode: '' };
        }

        // Try to extract postal code (typically 5-6 digits at start)
        const postalCodeMatch = lastLine.match(/^(\d{4,6})\s+(.+)$/);

        if (postalCodeMatch) {
            return {
                postalCode: postalCodeMatch[1] || '',
                city: postalCodeMatch[2] || '',
            };
        }

        // If no postal code found, assume it's a city
        return {
            postalCode: '',
            city: lastLine || '',
        };
    }

    /**
     * Extract phone number from address string
     */
    extractPhoneFromAddress(addressLine: string): string {
        const phoneRegex = /(\+?\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{1,9})/;
        const match = addressLine?.match(phoneRegex);
        return match?.[1] ?? '';
    }
}

export const reviewService = new ReviewService();
