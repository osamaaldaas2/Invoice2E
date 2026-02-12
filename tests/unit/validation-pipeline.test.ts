import { describe, it, expect } from 'vitest';
import { validateForXRechnung } from '@/validation/validation-pipeline';
import type { XRechnungInvoiceData } from '@/services/xrechnung/types';

/** Helper to create a fully valid XRechnung invoice data object */
function createValidData(): XRechnungInvoiceData {
  return {
    invoiceNumber: 'INV-001',
    invoiceDate: '2024-01-30',
    buyerName: 'Buyer GmbH',
    buyerEmail: 'buyer@example.de',
    buyerElectronicAddress: 'buyer@example.de',
    buyerElectronicAddressScheme: 'EM',
    buyerAddress: 'Käuferstr. 1',
    buyerCity: 'Berlin',
    buyerPostalCode: '10115',
    buyerCountryCode: 'DE',
    buyerReference: '04011000-12345-67',
    sellerName: 'Seller AG',
    sellerEmail: 'seller@example.de',
    sellerElectronicAddress: 'seller@example.de',
    sellerElectronicAddressScheme: 'EM',
    sellerAddress: 'Verkäuferstr. 2',
    sellerCity: 'Munich',
    sellerPostalCode: '80331',
    sellerCountryCode: 'DE',
    sellerTaxId: 'DE123456789',
    sellerVatId: 'DE123456789',
    sellerContact: 'Max Mustermann',
    sellerPhone: '+49 89 12345',
    sellerIban: 'DE89370400440532013000',
    sellerBic: 'COBADEFFXXX',
    lineItems: [
      { description: 'Widget A', quantity: 2, unitPrice: 50, totalPrice: 100, taxRate: 19 },
    ],
    subtotal: 100,
    taxRate: 19,
    taxAmount: 19,
    totalAmount: 119,
    currency: 'EUR',
    paymentTerms: 'Net 30',
    notes: 'Thank you',
  };
}

describe('validation-pipeline', () => {
  describe('validateForXRechnung', () => {
    it('passes for a fully valid invoice', () => {
      const result = validateForXRechnung(createValidData());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.profile).toBe('xrechnung-3.0-cii');
    });

    // Schema validation
    it('reports missing invoice number', () => {
      const data = { ...createValidData(), invoiceNumber: '' };
      const result = validateForXRechnung(data);
      expect(result.errors.some((e) => e.ruleId === 'SCHEMA-001')).toBe(true);
    });

    it('reports missing seller name', () => {
      const data = { ...createValidData(), sellerName: '' };
      const result = validateForXRechnung(data);
      expect(result.errors.some((e) => e.ruleId === 'SCHEMA-003')).toBe(true);
    });

    it('reports missing line items', () => {
      const data = { ...createValidData(), lineItems: [] };
      const result = validateForXRechnung(data);
      expect(result.errors.some((e) => e.ruleId === 'SCHEMA-006')).toBe(true);
    });

    // BR-DE rules
    it('BR-DE-2: reports missing seller contact (no phone)', () => {
      const data = createValidData();
      data.sellerPhone = undefined;
      data.sellerPhoneNumber = undefined;
      const result = validateForXRechnung(data);
      expect(result.errors.some((e) => e.ruleId === 'BR-DE-2')).toBe(true);
    });

    it('BR-DE-2: reports missing seller contact (no email)', () => {
      const data = createValidData();
      data.sellerEmail = undefined;
      const result = validateForXRechnung(data);
      expect(result.errors.some((e) => e.ruleId === 'BR-DE-2')).toBe(true);
    });

    it('BR-DE-3: reports missing seller city', () => {
      const data = { ...createValidData(), sellerCity: '' };
      const result = validateForXRechnung(data);
      expect(result.errors.some((e) => e.ruleId === 'BR-DE-3')).toBe(true);
    });

    it('BR-DE-4: reports missing seller postal code', () => {
      const data = { ...createValidData(), sellerPostalCode: '' };
      const result = validateForXRechnung(data);
      expect(result.errors.some((e) => e.ruleId === 'BR-DE-4')).toBe(true);
    });

    it('BR-DE-23-a: reports missing IBAN', () => {
      const data = createValidData();
      data.sellerIban = undefined;
      const result = validateForXRechnung(data);
      expect(result.errors.some((e) => e.ruleId === 'BR-DE-23-a')).toBe(true);
    });

    it('PEPPOL-EN16931-R010: reports missing buyer electronic address', () => {
      const data = createValidData();
      data.buyerElectronicAddress = undefined;
      const result = validateForXRechnung(data);
      expect(result.errors.some((e) => e.ruleId === 'PEPPOL-EN16931-R010')).toBe(true);
    });

    it('PEPPOL-EN16931-R010: passes when buyerElectronicAddress exists but buyerEmail is null', () => {
      const data = createValidData();
      data.buyerEmail = undefined;
      data.buyerElectronicAddress = 'buyer@example.de';
      const result = validateForXRechnung(data);
      // Should still pass PEPPOL — electronic address is present (BR-DE-2 may fail for seller contact)
      expect(result.errors.some((e) => e.ruleId === 'PEPPOL-EN16931-R010')).toBe(false);
    });

    it('BR-DE-SELLER-EADDR: passes when sellerElectronicAddress exists but sellerEmail is null', () => {
      const data = createValidData();
      data.sellerEmail = undefined;
      data.sellerElectronicAddress = 'seller@example.de';
      const result = validateForXRechnung(data);
      expect(result.errors.some((e) => e.ruleId === 'BR-DE-SELLER-EADDR')).toBe(false);
    });

    it('PEPPOL-EN16931-R010: passes for non-email endpoint ID as buyerElectronicAddress', () => {
      const data = createValidData();
      data.buyerEmail = undefined;
      data.buyerElectronicAddress = '0204:123456789';
      const result = validateForXRechnung(data);
      expect(result.errors.some((e) => e.ruleId === 'PEPPOL-EN16931-R010')).toBe(false);
    });

    it('BR-CO-25: reports missing payment terms and due date', () => {
      const data = createValidData();
      data.paymentTerms = undefined;
      data.paymentDueDate = undefined;
      data.dueDate = undefined;
      const result = validateForXRechnung(data);
      expect(result.errors.some((e) => e.ruleId === 'BR-CO-25')).toBe(true);
    });

    // Monetary cross-checks
    it('BR-CO-15: reports total mismatch', () => {
      const data = createValidData();
      data.totalAmount = 999; // Wrong
      const result = validateForXRechnung(data);
      expect(result.errors.some((e) => e.ruleId === 'BR-CO-15')).toBe(true);
    });

    it('BR-CO-10: reports line sum != subtotal', () => {
      const data = createValidData();
      data.subtotal = 999; // Wrong — lines sum to 100
      const result = validateForXRechnung(data);
      expect(result.errors.some((e) => e.ruleId === 'BR-CO-10')).toBe(true);
    });

    // Collects multiple errors (not fail-fast)
    it('collects multiple errors in a single pass', () => {
      const data = {
        ...createValidData(),
        invoiceNumber: '',
        sellerName: '',
        sellerCity: '',
        sellerPostalCode: '',
      };
      const result = validateForXRechnung(data);
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
    });

    // F2: Credit note (type 381) — negative total must NOT trigger SCHEMA-005
    it('SCHEMA-005: allows negative total for credit note (type 381)', () => {
      const data = { ...createValidData(), documentTypeCode: 381 as const, totalAmount: -119 };
      const result = validateForXRechnung(data);
      expect(result.errors.some((e) => e.ruleId === 'SCHEMA-005')).toBe(false);
    });

    it('SCHEMA-005: still rejects total <= 0 for invoice (type 380)', () => {
      const data = { ...createValidData(), documentTypeCode: 380 as const, totalAmount: 0 };
      const result = validateForXRechnung(data);
      expect(result.errors.some((e) => e.ruleId === 'SCHEMA-005')).toBe(true);
    });

    it('SCHEMA-005: rejects total <= 0 when documentTypeCode is absent (defaults to 380)', () => {
      const data = { ...createValidData(), totalAmount: -50 };
      delete (data as Record<string, unknown>).documentTypeCode;
      const result = validateForXRechnung(data);
      expect(result.errors.some((e) => e.ruleId === 'SCHEMA-005')).toBe(true);
    });

    it('SCHEMA-005: rejects null totalAmount for credit note (type 381)', () => {
      const data = {
        ...createValidData(),
        documentTypeCode: 381 as const,
        totalAmount: null as unknown as number,
      };
      const result = validateForXRechnung(data);
      expect(result.errors.some((e) => e.ruleId === 'SCHEMA-005')).toBe(true);
    });

    it('SCHEMA-005: rejects NaN totalAmount', () => {
      const data = { ...createValidData(), totalAmount: NaN };
      const result = validateForXRechnung(data);
      const schemaError = result.errors.find((e) => e.ruleId === 'SCHEMA-005');
      expect(schemaError).toBeDefined();
      expect(schemaError!.message).toBe('Total amount must be a valid number');
    });

    it('SCHEMA-005: rejects Infinity totalAmount', () => {
      const data = { ...createValidData(), totalAmount: Infinity };
      const result = validateForXRechnung(data);
      const schemaError = result.errors.find((e) => e.ruleId === 'SCHEMA-005');
      expect(schemaError).toBeDefined();
      expect(schemaError!.message).toBe('Total amount must be a valid number');
    });

    it('SCHEMA-005: rejects NaN totalAmount even for credit note (type 381)', () => {
      const data = { ...createValidData(), documentTypeCode: 381 as const, totalAmount: NaN };
      const result = validateForXRechnung(data);
      const schemaError = result.errors.find((e) => e.ruleId === 'SCHEMA-005');
      expect(schemaError).toBeDefined();
      expect(schemaError!.message).toBe('Total amount must be a valid number');
    });
  });
});
