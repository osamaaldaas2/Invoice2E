import { describe, it, expect, beforeEach } from 'vitest';
import { ReviewService, ReviewedInvoiceData } from '@/services/review.service';
import { ValidationError } from '@/lib/errors';

describe('ReviewService', () => {
    let service: ReviewService;

    beforeEach(() => {
        service = new ReviewService();
    });

    const validData: ReviewedInvoiceData = {
        invoiceNumber: 'INV-001',
        invoiceDate: '2024-01-30',
        buyerName: 'Test Buyer GmbH',
        buyerEmail: 'buyer@test.com',
        buyerAddress: '123 Buyer Street, Berlin',
        buyerTaxId: 'DE123456789',
        buyerCity: 'Berlin',
        buyerPostalCode: '10115',
        buyerCountryCode: 'DE',
        buyerReference: 'REF-123',
        buyerContact: 'John Doe',
        sellerName: 'Test Seller AG',
        sellerEmail: 'seller@test.com',
        sellerAddress: '456 Seller Ave, Munich',
        sellerCity: 'Munich',
        sellerPostalCode: '80331',
        sellerCountryCode: 'DE',
        sellerContact: 'Jane Smith',
        sellerTaxId: 'DE987654321',
        lineItems: [
            { description: 'Product A', quantity: 2, unitPrice: 50, totalPrice: 100 },
        ],
        subtotal: 100,
        taxAmount: 19,
        totalAmount: 119,
        currency: 'EUR',
        paymentTerms: 'Net 30',
        paymentInstructions: 'Bank Transfer',
        notes: 'Thank you for your business',
    };

    describe('validateReviewedData', () => {
        it('should accept valid data', () => {
            expect(service.validateReviewedData(validData)).toBe(true);
        });

        it('should reject missing invoice number', () => {
            const data = { ...validData, invoiceNumber: '' };
            expect(() => service.validateReviewedData(data)).toThrow(ValidationError);
            expect(() => service.validateReviewedData(data)).toThrow('Invoice number is required');
        });

        it('should reject missing invoice date', () => {
            const data = { ...validData, invoiceDate: '' };
            expect(() => service.validateReviewedData(data)).toThrow(ValidationError);
        });

        it('should reject missing buyer name', () => {
            const data = { ...validData, buyerName: '' };
            expect(() => service.validateReviewedData(data)).toThrow(ValidationError);
        });

        it('should reject missing seller name', () => {
            const data = { ...validData, sellerName: '' };
            expect(() => service.validateReviewedData(data)).toThrow(ValidationError);
        });

        it('should reject negative amounts', () => {
            const data = { ...validData, totalAmount: -100 };
            expect(() => service.validateReviewedData(data)).toThrow(ValidationError);
            expect(() => service.validateReviewedData(data)).toThrow('Amounts cannot be negative');
        });

        it('should reject empty line items', () => {
            const data = { ...validData, lineItems: [] };
            expect(() => service.validateReviewedData(data)).toThrow(ValidationError);
            expect(() => service.validateReviewedData(data)).toThrow('at least one line item');
        });

        it('should reject line item without description', () => {
            const data = {
                ...validData,
                lineItems: [{ description: '', quantity: 1, unitPrice: 100, totalPrice: 100 }],
            };
            expect(() => service.validateReviewedData(data)).toThrow(ValidationError);
        });

        it('should reject line item with zero quantity', () => {
            const data = {
                ...validData,
                lineItems: [{ description: 'Item', quantity: 0, unitPrice: 100, totalPrice: 100 }],
            };
            expect(() => service.validateReviewedData(data)).toThrow(ValidationError);
        });

        it('should reject line item with zero unit price', () => {
            const data = {
                ...validData,
                lineItems: [{ description: 'Item', quantity: 1, unitPrice: 0, totalPrice: 0 }],
            };
            expect(() => service.validateReviewedData(data)).toThrow(ValidationError);
        });

        it('should reject invalid date format', () => {
            const data = { ...validData, invoiceDate: '30-01-2024' };
            expect(() => service.validateReviewedData(data)).toThrow(ValidationError);
            expect(() => service.validateReviewedData(data)).toThrow('YYYY-MM-DD format');
        });

        it('should reject invalid buyer email', () => {
            const data = { ...validData, buyerEmail: 'not-an-email' };
            expect(() => service.validateReviewedData(data)).toThrow(ValidationError);
        });

        it('should reject invalid seller email', () => {
            const data = { ...validData, sellerEmail: 'invalid' };
            expect(() => service.validateReviewedData(data)).toThrow(ValidationError);
        });

        it('should accept data with optional fields empty', () => {
            const data = {
                ...validData,
                buyerEmail: '',
                sellerEmail: '',
                paymentTerms: '',
                notes: '',
            };
            expect(service.validateReviewedData(data)).toBe(true);
        });
    });

    describe('trackChanges', () => {
        it('should detect invoice number change', () => {
            const original = { invoiceNumber: 'OLD-001' };
            const reviewed = { ...validData, invoiceNumber: 'NEW-001' };
            const changes = service.trackChanges(original, reviewed);
            expect(changes).toContain('Invoice number');
        });

        it('should detect total amount change', () => {
            const original = { totalAmount: 100 };
            const reviewed = { ...validData, totalAmount: 200 };
            const changes = service.trackChanges(original, reviewed);
            expect(changes).toContain('Total amount');
        });

        it('should detect line items count change', () => {
            const original = { items: [{ description: 'A' }, { description: 'B' }] };
            const reviewed = { ...validData }; // has 1 item
            const changes = service.trackChanges(original, reviewed);
            expect(changes).toContain('Line items count');
        });

        it('should return empty array when no changes', () => {
            const original = {
                invoiceNumber: validData.invoiceNumber,
                invoiceDate: validData.invoiceDate,
                buyerName: validData.buyerName,
                sellerName: validData.sellerName,
                totalAmount: validData.totalAmount,
                lineItems: validData.lineItems,
                buyerReference: validData.buyerReference,
                paymentInstructions: validData.paymentInstructions,
            };
            const changes = service.trackChanges(original, validData);
            expect(changes).toHaveLength(0);
        });
    });

    describe('calculateAccuracy', () => {
        it('should return 100% when no changes', () => {
            const original = {
                invoiceNumber: validData.invoiceNumber,
                invoiceDate: validData.invoiceDate,
                buyerName: validData.buyerName,
                sellerName: validData.sellerName,
                totalAmount: validData.totalAmount,
                lineItems: validData.lineItems,
                buyerReference: validData.buyerReference,
                paymentInstructions: validData.paymentInstructions,
            };
            const accuracy = service.calculateAccuracy(original, validData);
            expect(accuracy).toBe(100);
        });

        it('should decrease accuracy with changes', () => {
            const original = { invoiceNumber: 'OLD' };
            const accuracy = service.calculateAccuracy(original, validData);
            expect(accuracy).toBeLessThan(100);
            expect(accuracy).toBeGreaterThan(0);
        });

        it('should return value between 0 and 100', () => {
            const original = {
                invoiceNumber: 'X',
                invoiceDate: 'Y',
                buyerName: 'Z',
                sellerName: 'W',
                totalAmount: 999999,
                lineItems: [],
            };
            const accuracy = service.calculateAccuracy(original, validData);
            expect(accuracy).toBeGreaterThanOrEqual(0);
            expect(accuracy).toBeLessThanOrEqual(100);
        });
    });

    describe('recalculateTotals', () => {
        it('should calculate subtotal from line items', () => {
            const lineItems = [
                { description: 'A', quantity: 1, unitPrice: 100, totalPrice: 100, taxRate: 0 },
                { description: 'B', quantity: 2, unitPrice: 50, totalPrice: 100, taxRate: 0 },
            ];
            const result = service.recalculateTotals(lineItems);
            expect(result.subtotal).toBe(200);
        });

        it('should calculate tax amount from line item tax rates', () => {
            const lineItems = [
                { description: 'A', quantity: 1, unitPrice: 100, totalPrice: 100, taxRate: 19 },
            ];
            const result = service.recalculateTotals(lineItems);
            expect(result.taxAmount).toBe(19);
        });

        it('should calculate total from subtotal and tax', () => {
            const lineItems = [
                { description: 'A', quantity: 1, unitPrice: 100, totalPrice: 100, taxRate: 19 },
            ];
            const result = service.recalculateTotals(lineItems);
            expect(result.totalAmount).toBe(119);
        });

        it('should handle items without tax rate', () => {
            const lineItems = [
                { description: 'A', quantity: 1, unitPrice: 100, totalPrice: 100 },
            ];
            const result = service.recalculateTotals(lineItems);
            expect(result.taxAmount).toBe(0);
            expect(result.totalAmount).toBe(100);
        });
    });
});
