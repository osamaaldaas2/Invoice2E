import { describe, it, expect, beforeEach } from 'vitest';
import { XRechnungService } from '../../services/xrechnung.service';
import { ValidationError } from '../../lib/errors';


describe('XRechnungService', () => {
    let service: XRechnungService;

    beforeEach(() => {
        service = new XRechnungService();
    });

    // Helper to create valid mock data
    const createValidData = (): any => {
        const items = [
            { description: 'Item 1', quantity: 2, unitPrice: 50, totalPrice: 100 },
        ];

        return {
            invoiceNumber: 'INV-001',
            invoiceDate: '2024-01-30',

            buyerName: 'Buyer Company',
            buyerEmail: 'buyer@test.de',
            buyerAddress: '123 Test St, Berlin',
            buyerTaxId: 'DE123456789',
            buyerCountryCode: 'DE',
            buyerCity: 'Berlin',
            buyerPostalCode: '10115',
            buyerReference: 'REF-123',

            sellerName: 'Seller Company',
            supplierName: 'Seller Company', // Legacy Alias
            sellerEmail: 'seller@test.de',
            sellerAddress: '456 Test Ave, Munich',
            sellerTaxId: 'DE987654321',
            sellerCountryCode: 'DE',
            sellerCity: 'Munich',
            sellerPostalCode: '80331',
            sellerContact: 'Contact Person',

            items: items,
            lineItems: items,

            subtotal: 100,
            taxRate: 19,
            taxAmount: 19,
            totalAmount: 119,
            currency: 'EUR',
            paymentTerms: 'Net 30',
            paymentInstructions: 'Bank Transfer',
            notes: null
        };
    };

    describe('generateXRechnung', () => {
        it('should generate valid XML for complete invoice data', () => {
            const data = createValidData();
            const result = service.generateXRechnung(data);

            expect(result.xmlContent).toBeDefined();
            expect(result.xmlContent).toContain('rsm:CrossIndustryInvoice');
            expect(result.xmlContent).toContain('INV-001');
            expect(result.validationStatus).toBe('valid');
            expect(result.fileName).toBe('INV-001_xrechnung.xml');
        });

        it('should reject missing invoice number', () => {
            const data = createValidData();
            data.invoiceNumber = null;

            expect(() => service.generateXRechnung(data)).toThrow(ValidationError);
        });

        it('should reject missing invoice date', () => {
            const data = createValidData();
            data.invoiceDate = null;

            expect(() => service.generateXRechnung(data)).toThrow(ValidationError);
        });

        it('should reject invalid total amount', () => {
            const data = createValidData();
            data.totalAmount = 0;

            expect(() => service.generateXRechnung(data)).toThrow(ValidationError);
        });

        it('should reject empty line items', () => {
            const data = createValidData();
            data.items = [];
            data.lineItems = []; // Clear both aliases

            expect(() => service.generateXRechnung(data)).toThrow(ValidationError);
        });

        it('should escape XML special characters correctly', () => {
            const data = createValidData();
            data.buyerName = 'Test & Co. <Ltd>';
            data.items[0].description = 'Item with "quotes"';

            const result = service.generateXRechnung(data);

            expect(result.xmlContent).toContain('Test &amp; Co. &lt;Ltd&gt;');
            expect(result.xmlContent).toContain('Item with &quot;quotes&quot;');
        });

        it('should format dates correctly (YYYYMMDD)', () => {
            const data = createValidData();
            data.invoiceDate = '2024-01-31';

            const result = service.generateXRechnung(data);

            expect(result.xmlContent).toContain('<udt:DateTimeString format="102">20240131</udt:DateTimeString>');
        });

        it('should handle missing optional fields gracefully', () => {
            const data = createValidData();
            data.paymentTerms = null;
            data.paymentDueDate = '2024-02-28'; // Provide alternative required field
            data.notes = null;
            data.buyerEmail = null;

            const result = service.generateXRechnung(data);

            expect(result.validationStatus).toBe('valid');
            expect(result.xmlContent).not.toContain('<ram:Content>Net 30</ram:Content>');
        });

        it('should include tax breakdown calculations', () => {
            const data = createValidData();
            const result = service.generateXRechnung(data);

            expect(result.xmlContent).toContain('<ram:CalculatedAmount>19.00</ram:CalculatedAmount>');
            expect(result.xmlContent).toContain('<ram:BasisAmount>100.00</ram:BasisAmount>');
            expect(result.xmlContent).toContain('<ram:RateApplicablePercent>19.00</ram:RateApplicablePercent>');
        });
    });
});
