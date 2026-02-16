import { describe, it, expect } from 'vitest';
import { validateForProfile } from '@/validation/validation-pipeline';
import type { CanonicalInvoice } from '@/types/canonical-invoice';

/** Helper to create a fully valid CanonicalInvoice for XRechnung */
function createValidData(): CanonicalInvoice {
  return {
    outputFormat: 'xrechnung-cii',
    invoiceNumber: 'INV-001',
    invoiceDate: '2024-01-30',
    currency: 'EUR',
    buyerReference: '04011000-12345-67',
    notes: 'Thank you',
    buyer: {
      name: 'Buyer GmbH',
      email: 'buyer@example.de',
      electronicAddress: 'buyer@example.de',
      electronicAddressScheme: 'EM',
      address: 'Käuferstr. 1',
      city: 'Berlin',
      postalCode: '10115',
      countryCode: 'DE',
    },
    seller: {
      name: 'Seller AG',
      email: 'seller@example.de',
      electronicAddress: 'seller@example.de',
      electronicAddressScheme: 'EM',
      address: 'Verkäuferstr. 2',
      city: 'Munich',
      postalCode: '80331',
      countryCode: 'DE',
      taxId: 'DE123456789',
      vatId: 'DE123456789',
      contactName: 'Max Mustermann',
      phone: '+49 89 12345',
    },
    payment: {
      iban: 'DE89370400440532013000',
      bic: 'COBADEFFXXX',
      paymentTerms: 'Net 30',
    },
    lineItems: [
      { description: 'Widget A', quantity: 2, unitPrice: 50, totalPrice: 100, taxRate: 19 },
    ],
    totals: {
      subtotal: 100,
      taxAmount: 19,
      totalAmount: 119,
    },
    taxRate: 19,
  };
}

describe('validation-pipeline', () => {
  describe('validateForProfile (xrechnung-cii)', () => {
    it('passes for a fully valid invoice', () => {
      const result = validateForProfile(createValidData());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.profile).toBe('xrechnung-3.0-cii');
    });

    // Schema validation
    it('reports missing invoice number', () => {
      const data = { ...createValidData(), invoiceNumber: '' };
      const result = validateForProfile(data);
      expect(result.errors.some((e) => e.ruleId === 'SCHEMA-001')).toBe(true);
    });

    it('reports missing seller name', () => {
      const data = createValidData();
      data.seller = { ...data.seller, name: '' };
      const result = validateForProfile(data);
      expect(result.errors.some((e) => e.ruleId === 'SCHEMA-003')).toBe(true);
    });

    it('reports missing line items', () => {
      const data = { ...createValidData(), lineItems: [] };
      const result = validateForProfile(data);
      expect(result.errors.some((e) => e.ruleId === 'SCHEMA-006')).toBe(true);
    });

    // BR-DE rules
    it('BR-DE-2: reports missing seller contact (no phone)', () => {
      const data = createValidData();
      data.seller = { ...data.seller, phone: undefined };
      const result = validateForProfile(data);
      expect(result.errors.some((e) => e.ruleId === 'BR-DE-2')).toBe(true);
    });

    it('BR-DE-2: reports missing seller contact (no email)', () => {
      const data = createValidData();
      data.seller = { ...data.seller, email: undefined };
      const result = validateForProfile(data);
      expect(result.errors.some((e) => e.ruleId === 'BR-DE-2')).toBe(true);
    });

    it('BR-DE-3: reports missing seller city', () => {
      const data = createValidData();
      data.seller = { ...data.seller, city: '' };
      const result = validateForProfile(data);
      expect(result.errors.some((e) => e.ruleId === 'BR-DE-3')).toBe(true);
    });

    it('BR-DE-4: reports missing seller postal code', () => {
      const data = createValidData();
      data.seller = { ...data.seller, postalCode: '' };
      const result = validateForProfile(data);
      expect(result.errors.some((e) => e.ruleId === 'BR-DE-4')).toBe(true);
    });

    it('BR-DE-23-a: reports missing IBAN', () => {
      const data = createValidData();
      data.payment = { ...data.payment, iban: undefined };
      const result = validateForProfile(data);
      expect(result.errors.some((e) => e.ruleId === 'BR-DE-23-a')).toBe(true);
    });

    it('PEPPOL-EN16931-R010: reports missing buyer electronic address', () => {
      const data = createValidData();
      data.buyer = { ...data.buyer, electronicAddress: undefined };
      const result = validateForProfile(data);
      expect(result.errors.some((e) => e.ruleId === 'PEPPOL-EN16931-R010')).toBe(true);
    });

    it('PEPPOL-EN16931-R010: passes when buyerElectronicAddress exists but buyerEmail is null', () => {
      const data = createValidData();
      data.buyer = { ...data.buyer, email: undefined, electronicAddress: 'buyer@example.de' };
      const result = validateForProfile(data);
      expect(result.errors.some((e) => e.ruleId === 'PEPPOL-EN16931-R010')).toBe(false);
    });

    it('BR-DE-SELLER-EADDR: passes when sellerElectronicAddress exists but sellerEmail is null', () => {
      const data = createValidData();
      data.seller = { ...data.seller, email: undefined, electronicAddress: 'seller@example.de' };
      const result = validateForProfile(data);
      expect(result.errors.some((e) => e.ruleId === 'BR-DE-SELLER-EADDR')).toBe(false);
    });

    it('PEPPOL-EN16931-R010: passes for non-email endpoint ID as buyerElectronicAddress', () => {
      const data = createValidData();
      data.buyer = { ...data.buyer, email: undefined, electronicAddress: '0204:123456789' };
      const result = validateForProfile(data);
      expect(result.errors.some((e) => e.ruleId === 'PEPPOL-EN16931-R010')).toBe(false);
    });

    it('BR-CO-25: reports missing payment terms and due date', () => {
      const data = createValidData();
      data.payment = { ...data.payment, paymentTerms: undefined, dueDate: undefined };
      const result = validateForProfile(data);
      expect(result.errors.some((e) => e.ruleId === 'BR-CO-25')).toBe(true);
    });

    // Monetary cross-checks
    it('BR-CO-15: reports total mismatch', () => {
      const data = createValidData();
      data.totals = { ...data.totals, totalAmount: 999 };
      const result = validateForProfile(data);
      expect(result.errors.some((e) => e.ruleId === 'BR-CO-15')).toBe(true);
    });

    it('BR-CO-10: reports line sum != subtotal', () => {
      const data = createValidData();
      data.totals = { ...data.totals, subtotal: 999 };
      const result = validateForProfile(data);
      expect(result.errors.some((e) => e.ruleId === 'BR-CO-10')).toBe(true);
    });

    // Collects multiple errors (not fail-fast)
    it('collects multiple errors in a single pass', () => {
      const data = createValidData();
      data.invoiceNumber = '';
      data.seller = { ...data.seller, name: '', city: '', postalCode: '' };
      const result = validateForProfile(data);
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
    });

    // F2: Credit note (type 381) — negative total must NOT trigger SCHEMA-005
    it('SCHEMA-005: allows negative total for credit note (type 381)', () => {
      const data = { ...createValidData(), documentTypeCode: 381 as const };
      data.totals = { ...data.totals, totalAmount: -119 };
      const result = validateForProfile(data);
      expect(result.errors.some((e) => e.ruleId === 'SCHEMA-005')).toBe(false);
    });

    it('SCHEMA-005: still rejects total <= 0 for invoice (type 380)', () => {
      const data = { ...createValidData(), documentTypeCode: 380 as const };
      data.totals = { ...data.totals, totalAmount: 0 };
      const result = validateForProfile(data);
      expect(result.errors.some((e) => e.ruleId === 'SCHEMA-005')).toBe(true);
    });

    it('SCHEMA-005: rejects total <= 0 when documentTypeCode is absent (defaults to 380)', () => {
      const data = createValidData();
      data.totals = { ...data.totals, totalAmount: -50 };
      delete (data as unknown as Record<string, unknown>).documentTypeCode;
      const result = validateForProfile(data);
      expect(result.errors.some((e) => e.ruleId === 'SCHEMA-005')).toBe(true);
    });

    it('SCHEMA-005: rejects null totalAmount for credit note (type 381)', () => {
      const data = { ...createValidData(), documentTypeCode: 381 as const };
      data.totals = { ...data.totals, totalAmount: null as unknown as number };
      const result = validateForProfile(data);
      expect(result.errors.some((e) => e.ruleId === 'SCHEMA-005')).toBe(true);
    });

    it('SCHEMA-005: rejects NaN totalAmount', () => {
      const data = createValidData();
      data.totals = { ...data.totals, totalAmount: NaN };
      const result = validateForProfile(data);
      const schemaError = result.errors.find((e) => e.ruleId === 'SCHEMA-005');
      expect(schemaError).toBeDefined();
      expect(schemaError!.message).toBe('Total amount must be a valid number');
    });

    it('SCHEMA-005: rejects Infinity totalAmount', () => {
      const data = createValidData();
      data.totals = { ...data.totals, totalAmount: Infinity };
      const result = validateForProfile(data);
      const schemaError = result.errors.find((e) => e.ruleId === 'SCHEMA-005');
      expect(schemaError).toBeDefined();
      expect(schemaError!.message).toBe('Total amount must be a valid number');
    });

    it('SCHEMA-005: rejects NaN totalAmount even for credit note (type 381)', () => {
      const data = { ...createValidData(), documentTypeCode: 381 as const };
      data.totals = { ...data.totals, totalAmount: NaN };
      const result = validateForProfile(data);
      const schemaError = result.errors.find((e) => e.ruleId === 'SCHEMA-005');
      expect(schemaError).toBeDefined();
      expect(schemaError!.message).toBe('Total amount must be a valid number');
    });
  });
});
