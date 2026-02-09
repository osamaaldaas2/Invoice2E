import { ValidationError } from '@/lib/errors';
import { XRechnungInvoiceData } from './types';

export class XRechnungValidator {
    validateInvoiceData(data: XRechnungInvoiceData): void {
        const errors: string[] = [];

        // EN16931 Required fields
        if (!data.invoiceNumber) errors.push('Invoice number is required');
        if (!data.invoiceDate) errors.push('Invoice date is required');

        // Seller
        if (!data.sellerName) errors.push('Seller name is required');
        if (!data.sellerCountryCode) errors.push('Seller country code is required (BR-09)');
        if (!data.sellerCity) errors.push('Seller city is required (BR-DE-3)');
        if (!data.sellerPostalCode) errors.push('Seller postal code is required (BR-DE-4)');

        // Buyer
        if (!data.buyerName) errors.push('Buyer name is required');
        if (!data.buyerCountryCode) errors.push('Buyer country code is required (BR-11)');

        // Payment
        if (!data.paymentTerms && !data.paymentDueDate) {
            errors.push('Either payment terms or payment due date is required (BR-CO-25)');
        }

        // Amounts
        if (!data.totalAmount || data.totalAmount <= 0) errors.push('Total amount must be greater than 0');

        // Line items
        if (!Array.isArray(data.lineItems) || data.lineItems.length === 0) {
            errors.push('At least one line item is required');
        }

        if (errors.length > 0) {
            throw new ValidationError('XRechnung validation failed:\n' + errors.join('\n'));
        }
    }
}

export const xrechnungValidator = new XRechnungValidator();
