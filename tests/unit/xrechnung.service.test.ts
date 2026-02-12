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
    const items = [{ description: 'Item 1', quantity: 2, unitPrice: 50, totalPrice: 100 }];

    return {
      invoiceNumber: 'INV-001',
      invoiceDate: '2024-01-30',

      buyerName: 'Buyer Company',
      buyerEmail: 'buyer@test.de',
      buyerElectronicAddress: 'buyer@test.de',
      buyerElectronicAddressScheme: 'EM',
      buyerAddress: '123 Test St, Berlin',
      buyerTaxId: 'DE123456789',
      buyerCountryCode: 'DE',
      buyerCity: 'Berlin',
      buyerPostalCode: '10115',
      buyerReference: 'REF-123',

      sellerName: 'Seller Company',
      sellerEmail: 'seller@test.de',
      sellerElectronicAddress: 'seller@test.de',
      sellerElectronicAddressScheme: 'EM',
      sellerAddress: '456 Test Ave, Munich',
      sellerTaxId: 'DE987654321',
      sellerCountryCode: 'DE',
      sellerCity: 'Munich',
      sellerPostalCode: '80331',
      sellerContact: 'Contact Person',
      sellerPhone: '+49 89 12345',
      sellerIban: 'DE89370400440532013000',

      lineItems: items,

      subtotal: 100,
      taxRate: 19,
      taxAmount: 19,
      totalAmount: 119,
      currency: 'EUR',
      paymentTerms: 'Net 30',
      paymentInstructions: 'Bank Transfer',
      notes: null,
    };
  };

  describe('generateXRechnung', () => {
    it('should generate valid XML for complete invoice data', async () => {
      const data = createValidData();
      const result = await service.generateXRechnung(data);

      expect(result.xmlContent).toBeDefined();
      expect(result.xmlContent).toContain('rsm:CrossIndustryInvoice');
      expect(result.xmlContent).toContain('INV-001');
      expect(result.validationStatus).toBe('valid');
      expect(result.fileName).toBe('INV-001_xrechnung.xml');
    });

    it('should reject missing invoice number', async () => {
      const data = createValidData();
      data.invoiceNumber = null;

      await expect(service.generateXRechnung(data)).rejects.toThrow(ValidationError);
    });

    it('should reject missing invoice date', async () => {
      const data = createValidData();
      data.invoiceDate = null;

      await expect(service.generateXRechnung(data)).rejects.toThrow(ValidationError);
    });

    it('should reject invalid total amount', async () => {
      const data = createValidData();
      data.totalAmount = 0;

      await expect(service.generateXRechnung(data)).rejects.toThrow(ValidationError);
    });

    it('should reject empty line items', async () => {
      const data = createValidData();
      data.items = [];
      data.lineItems = []; // Clear both aliases

      await expect(service.generateXRechnung(data)).rejects.toThrow(ValidationError);
    });

    it('should escape XML special characters correctly', async () => {
      const data = createValidData();
      data.buyerName = 'Test & Co. <Ltd>';
      data.lineItems[0].description = 'Item with "quotes"';

      const result = await service.generateXRechnung(data);

      expect(result.xmlContent).toContain('Test &amp; Co. &lt;Ltd&gt;');
      expect(result.xmlContent).toContain('Item with &quot;quotes&quot;');
    });

    it('should format dates correctly (YYYYMMDD)', async () => {
      const data = createValidData();
      data.invoiceDate = '2024-01-31';

      const result = await service.generateXRechnung(data);

      expect(result.xmlContent).toContain(
        '<udt:DateTimeString format="102">20240131</udt:DateTimeString>'
      );
    });

    it('should handle missing optional fields gracefully', async () => {
      const data = createValidData();
      data.paymentTerms = null;
      data.paymentDueDate = '2024-02-28'; // Provide alternative required field
      data.notes = null;

      const result = await service.generateXRechnung(data);

      expect(result.xmlContent).toBeDefined();
      expect(result.xmlContent).not.toContain('<ram:Description>Net 30</ram:Description>');
    });

    it('should include tax breakdown calculations', async () => {
      const data = createValidData();
      const result = await service.generateXRechnung(data);

      expect(result.xmlContent).toContain('<ram:CalculatedAmount>19.00</ram:CalculatedAmount>');
      expect(result.xmlContent).toContain('<ram:BasisAmount>100.00</ram:BasisAmount>');
      expect(result.xmlContent).toContain(
        '<ram:RateApplicablePercent>19.00</ram:RateApplicablePercent>'
      );
    });

    it('should map buyerElectronicAddress to XML URIUniversalCommunication with correct scheme', async () => {
      const data = createValidData();
      data.buyerElectronicAddress = 'custom-buyer@peppol.de';
      data.buyerElectronicAddressScheme = 'EM';
      const result = await service.generateXRechnung(data);
      expect(result.xmlContent).toContain('schemeID="EM"');
      expect(result.xmlContent).toContain('custom-buyer@peppol.de');
    });

    it('should use auto-detected scheme 0204 for non-email buyerElectronicAddress', async () => {
      const data = createValidData();
      data.buyerElectronicAddress = '0204:123456789';
      data.buyerElectronicAddressScheme = undefined;
      data.buyerEmail = undefined;
      const result = await service.generateXRechnung(data);
      expect(result.xmlContent).toContain('0204:123456789');
      expect(result.xmlContent).toContain('schemeID="0204"');
      expect(result.xmlContent).not.toMatch(/<ram:URIID[^>]*schemeID="EM"[^>]*>0204:123456789/);
    });

    it('T5: should default to EM scheme for non-PEPPOL, non-email electronic address', async () => {
      const data = createValidData();
      data.buyerElectronicAddress = '04011000-12345-67';
      data.buyerElectronicAddressScheme = undefined;
      data.buyerEmail = undefined;
      const result = await service.generateXRechnung(data);
      expect(result.xmlContent).toContain('04011000-12345-67');
      // Should NOT blindly assign '0204' — defaults to 'EM' when no PEPPOL prefix
      expect(result.xmlContent).toMatch(/<ram:URIID[^>]*schemeID="EM"[^>]*>04011000-12345-67/);
    });

    it('T5: should use explicit scheme when provided (seller)', async () => {
      const data = createValidData();
      data.sellerElectronicAddress = '9930:DE123456789';
      data.sellerElectronicAddressScheme = '9930';
      const result = await service.generateXRechnung(data);
      expect(result.xmlContent).toContain('schemeID="9930"');
      expect(result.xmlContent).toContain('9930:DE123456789');
    });

    it('should use recomputed total (not raw totalAmount) for GrandTotalAmount (F1)', async () => {
      const data = createValidData();
      // Line items: 1 item with totalPrice=100, taxRate=19% => subtotal=100, tax=19, total=119
      // Set totalAmount to a slightly wrong value that still passes BR-CO-15 within 0.02 tolerance
      data.totalAmount = 119.01;

      const result = await service.generateXRechnung(data);

      // GrandTotalAmount and DuePayableAmount must be recomputed: 100.00 + 19.00 = 119.00
      expect(result.xmlContent).toContain('<ram:GrandTotalAmount>119.00</ram:GrandTotalAmount>');
      expect(result.xmlContent).toContain('<ram:DuePayableAmount>119.00</ram:DuePayableAmount>');
      // Must NOT contain the raw input value
      expect(result.xmlContent).not.toContain(
        '<ram:GrandTotalAmount>119.01</ram:GrandTotalAmount>'
      );
    });

    // Note: Tests for temp XML cleanup are verified through:
    // 1. Code review of finally block in xrechnung.service.ts
    // 2. Integration/manual tests with ENABLE_EXTERNAL_VALIDATION=true
    // 3. Monitoring /tmp directory for leaked files
    //
    // Direct unit testing of fs.unlinkSync cleanup is challenging in ESM.
    // The implementation uses try/finally to ensure cleanup always runs.
  });
});
