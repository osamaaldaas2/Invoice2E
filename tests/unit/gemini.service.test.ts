import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiService, ExtractedInvoiceData } from '@/services/gemini.service';
import { AppError } from '@/lib/errors';

// Mock environment
vi.stubEnv('GEMINI_API_KEY', 'test-api-key');

describe('GeminiService', () => {
    let service: GeminiService;

    beforeEach(() => {
        service = new GeminiService();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('validateExtractedData', () => {
        it('should accept valid data with all required fields', () => {
            const validData: ExtractedInvoiceData = {
                invoiceNumber: 'INV-001',
                invoiceDate: '2024-01-15',
                buyerName: 'Test Buyer',
                buyerEmail: 'buyer@test.com',
                buyerAddress: '123 Test St',
                buyerCity: null,
                buyerPostalCode: null,
                buyerTaxId: 'DE123456789',
                buyerPhone: null,
                sellerName: 'Test Supplier',
                sellerEmail: 'supplier@test.com',
                sellerAddress: '456 Supplier Ave',
                sellerCity: null,
                sellerPostalCode: null,
                sellerTaxId: 'DE987654321',
                sellerPhone: null,
                lineItems: [
                    { description: 'Item 1', quantity: 2, unitPrice: 50, totalPrice: 100 },
                ],
                subtotal: 100,
                taxRate: 19,
                taxAmount: 19,
                totalAmount: 119,
                currency: 'EUR',
                paymentTerms: 'Net 30',
                notes: null,
            };

            expect(() => service.validateExtractedData(validData)).not.toThrow();
        });

        it('should reject data without total amount', () => {
            const invalidData = {
                lineItems: [{ description: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100 }],
                totalAmount: 0,
            } as ExtractedInvoiceData;

            expect(() => service.validateExtractedData(invalidData)).toThrow(AppError);
        });

        it('should reject data with empty items array', () => {
            const invalidData = {
                invoiceNumber: null,
                invoiceDate: null,
                buyerName: null,
                buyerEmail: null,
                buyerAddress: null,
                buyerCity: null,
                buyerPostalCode: null,
                buyerTaxId: null,
                buyerPhone: null,
                sellerName: null,
                sellerEmail: null,
                sellerAddress: null,
                sellerCity: null,
                sellerPostalCode: null,
                sellerTaxId: null,
                sellerPhone: null,
                lineItems: [],
                subtotal: 0,
                taxRate: 0,
                taxAmount: 0,
                totalAmount: 100,
                currency: 'EUR',
                paymentTerms: null,
                notes: null,
            } as ExtractedInvoiceData;

            expect(() => service.validateExtractedData(invalidData)).toThrow(AppError);
        });

        it('should reject items without description', () => {
            const invalidData = {
                lineItems: [{ description: '', quantity: 1, unitPrice: 100, totalPrice: 100 }],
                totalAmount: 100,
            } as ExtractedInvoiceData;

            expect(() => service.validateExtractedData(invalidData)).toThrow(AppError);
        });

        it('should reject items without quantity', () => {
            const invalidData = {
                lineItems: [{ description: 'Item', quantity: 0, unitPrice: 100, totalPrice: 100 }],
                totalAmount: 100,
            } as ExtractedInvoiceData;

            expect(() => service.validateExtractedData(invalidData)).toThrow(AppError);
        });

        it('should reject items without unit price', () => {
            const invalidData = {
                lineItems: [{ description: 'Item', quantity: 1, unitPrice: 0, totalPrice: 100 }],
                totalAmount: 100,
            } as ExtractedInvoiceData;

            expect(() => service.validateExtractedData(invalidData)).toThrow(AppError);
        });
    });

    describe('calculateConfidenceScore', () => {
        it('should return 100 for complete data', () => {
            const completeData: ExtractedInvoiceData = {
                invoiceNumber: 'INV-001',
                invoiceDate: '2024-01-15',
                buyerName: 'Test Buyer',
                buyerEmail: 'buyer@test.com',
                buyerAddress: '123 Test St',
                buyerCity: null,
                buyerPostalCode: null,
                buyerTaxId: 'DE123456789',
                buyerPhone: null,
                sellerName: 'Test Supplier',
                sellerEmail: 'supplier@test.com',
                sellerAddress: '456 Supplier Ave',
                sellerCity: null,
                sellerPostalCode: null,
                sellerTaxId: 'DE987654321',
                sellerPhone: null,
                lineItems: [{ description: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100 }],
                subtotal: 100,
                taxRate: 19,
                taxAmount: 19,
                totalAmount: 119,
                currency: 'EUR',
                paymentTerms: 'Net 30',
                notes: null,
            };

            const score = service.calculateConfidenceScore(completeData);
            expect(score).toBe(100);
        });

        it('should deduct points for missing invoice number', () => {
            const data: ExtractedInvoiceData = {
                invoiceNumber: null,
                invoiceDate: '2024-01-15',
                buyerName: 'Test Buyer',
                buyerEmail: 'buyer@test.com',
                buyerAddress: '123 Test St',
                buyerCity: null,
                buyerPostalCode: null,
                buyerTaxId: 'DE123456789',
                buyerPhone: null,
                sellerName: 'Test Supplier',
                sellerEmail: 'supplier@test.com',
                sellerAddress: '456 Supplier Ave',
                sellerCity: null,
                sellerPostalCode: null,
                sellerTaxId: 'DE987654321',
                sellerPhone: null,
                lineItems: [{ description: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100 }],
                subtotal: 100,
                taxRate: 19,
                taxAmount: 19,
                totalAmount: 119,
                currency: 'EUR',
                paymentTerms: null,
                notes: null,
            };

            const score = service.calculateConfidenceScore(data);
            expect(score).toBe(95);
        });

        it('should deduct points for missing buyer name', () => {
            const data: ExtractedInvoiceData = {
                invoiceNumber: 'INV-001',
                invoiceDate: '2024-01-15',
                buyerName: null,
                buyerEmail: 'buyer@test.com',
                buyerAddress: '123 Test St',
                buyerCity: null,
                buyerPostalCode: null,
                buyerTaxId: 'DE123456789',
                buyerPhone: null,
                sellerName: 'Test Supplier',
                sellerEmail: 'supplier@test.com',
                sellerAddress: '456 Supplier Ave',
                sellerCity: null,
                sellerPostalCode: null,
                sellerTaxId: 'DE987654321',
                sellerPhone: null,
                lineItems: [{ description: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100 }],
                subtotal: 100,
                taxRate: 19,
                taxAmount: 19,
                totalAmount: 119,
                currency: 'EUR',
                paymentTerms: null,
                notes: null,
            };

            const score = service.calculateConfidenceScore(data);
            expect(score).toBe(90);
        });

        it('should calculate cumulative deductions for multiple missing fields', () => {
            const data: ExtractedInvoiceData = {
                invoiceNumber: null,
                invoiceDate: null,
                buyerName: null,
                buyerEmail: null,
                buyerAddress: null,
                buyerCity: null,
                buyerPostalCode: null,
                buyerTaxId: null,
                buyerPhone: null,
                sellerName: null,
                sellerEmail: null,
                sellerAddress: null,
                sellerCity: null,
                sellerPostalCode: null,
                sellerTaxId: null,
                sellerPhone: null,
                lineItems: [{ description: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100 }],
                subtotal: 100,
                taxRate: 19,
                taxAmount: 19,
                totalAmount: 119,
                currency: 'EUR',
                paymentTerms: null,
                notes: null,
            };

            const score = service.calculateConfidenceScore(data);
            // 5+5+10+3+3+5+10+3+3+5 = 52 points deducted
            expect(score).toBe(48);
        });

        it('should never return negative score', () => {
            const emptyData: ExtractedInvoiceData = {
                invoiceNumber: null,
                invoiceDate: null,
                buyerName: null,
                buyerEmail: null,
                buyerAddress: null,
                buyerCity: null,
                buyerPostalCode: null,
                buyerTaxId: null,
                buyerPhone: null,
                sellerName: null,
                sellerEmail: null,
                sellerAddress: null,
                sellerCity: null,
                sellerPostalCode: null,
                sellerTaxId: null,
                sellerPhone: null,
                lineItems: [],
                subtotal: 0,
                taxRate: 0,
                taxAmount: 0,
                totalAmount: 0,
                currency: 'EUR',
                paymentTerms: null,
                notes: null,
            };

            const score = service.calculateConfidenceScore(emptyData);
            expect(score).toBeGreaterThanOrEqual(0);
        });
    });
});
