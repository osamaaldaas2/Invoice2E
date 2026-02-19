/**
 * KSeF FA(2) — comprehensive unit tests.
 * Covers: generator output, validation rules, factory registration.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GeneratorFactory } from '@/services/format/GeneratorFactory';
import { KsefGenerator } from '@/services/format/ksef/ksef.generator';
import { validateKsefRules } from '@/validation/ksef-rules';
import { getProfileValidator, getAvailableProfiles } from '@/validation/ProfileValidatorFactory';
import type { CanonicalInvoice } from '@/types/canonical-invoice';

// ─── Test Helper ─────────────────────────────────────────────────────────────

function makeKsefInvoice(overrides?: Partial<CanonicalInvoice>): CanonicalInvoice {
  return {
    outputFormat: 'ksef',
    invoiceNumber: 'FV/2024/001',
    invoiceDate: '2024-07-15',
    currency: 'PLN',
    seller: {
      name: 'Firma Testowa Sp. z o.o.',
      vatId: 'PL1234567890',
      address: 'ul. Testowa 1',
      city: 'Warszawa',
      postalCode: '00-001',
      countryCode: 'PL',
      email: 'test@firma.pl',
    },
    buyer: {
      name: 'Odbiorca Test S.A.',
      vatId: 'PL9876543210',
      address: 'ul. Kupiecka 5',
      city: 'Kraków',
      postalCode: '30-001',
      countryCode: 'PL',
    },
    payment: {
      iban: 'PL61109010140000071219812874',
      dueDate: '2024-08-15',
      paymentTerms: 'Net 30',
    },
    lineItems: [
      {
        description: 'Usługa doradcza',
        quantity: 10,
        unitPrice: 100.0,
        totalPrice: 1000.0,
        taxRate: 23,
        unitCode: 'C62',
      },
      {
        description: 'Materiały biurowe',
        quantity: 5,
        unitPrice: 50.0,
        totalPrice: 250.0,
        taxRate: 23,
        unitCode: 'C62',
      },
    ],
    totals: {
      subtotal: 1250.0,
      taxAmount: 287.5,
      totalAmount: 1537.5,
    },
    ...overrides,
  };
}

// ─── Generator Tests ─────────────────────────────────────────────────────────

describe('KsefGenerator', () => {
  let generator: KsefGenerator;

  beforeEach(() => {
    generator = new KsefGenerator();
  });

  it('should have correct formatId and formatName', () => {
    expect(generator.formatId).toBe('ksef');
    expect(generator.formatName).toContain('KSeF');
  });

  it('should generate valid XML with correct namespace', async () => {
    const result = await generator.generate(makeKsefInvoice());
    expect(result.xmlContent).toContain('<?xml version="1.0"');
    expect(result.xmlContent).toContain('xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/"');
    expect(result.validationStatus).toBe('valid');
  });

  it('should include Naglowek with FA(2) header', async () => {
    const result = await generator.generate(makeKsefInvoice());
    expect(result.xmlContent).toContain('<Naglowek>');
    expect(result.xmlContent).toContain('<KodFormularza');
    expect(result.xmlContent).toContain('>FA</KodFormularza>');
    expect(result.xmlContent).toContain('<WariantFormularza>2</WariantFormularza>');
    expect(result.xmlContent).toContain('<SystemInfo>Invoice2E</SystemInfo>');
  });

  it('should include Podmiot1 (seller) with NIP', async () => {
    const result = await generator.generate(makeKsefInvoice());
    expect(result.xmlContent).toContain('<Podmiot1>');
    expect(result.xmlContent).toContain('<NIP>1234567890</NIP>');
    expect(result.xmlContent).toContain('<Nazwa>Firma Testowa Sp. z o.o.</Nazwa>');
    expect(result.xmlContent).toContain('<KodKraju>PL</KodKraju>');
  });

  it('should include Podmiot2 (buyer) with NIP', async () => {
    const result = await generator.generate(makeKsefInvoice());
    expect(result.xmlContent).toContain('<Podmiot2>');
    expect(result.xmlContent).toContain('<NIP>9876543210</NIP>');
    expect(result.xmlContent).toContain('<Nazwa>Odbiorca Test S.A.</Nazwa>');
  });

  it('should include Fa section with invoice data', async () => {
    const result = await generator.generate(makeKsefInvoice());
    expect(result.xmlContent).toContain('<Fa>');
    expect(result.xmlContent).toContain('<KodWaluty>PLN</KodWaluty>');
    expect(result.xmlContent).toContain('<P_1>2024-07-15</P_1>');
    expect(result.xmlContent).toContain('<P_2>FV/2024/001</P_2>');
    expect(result.xmlContent).toContain('<P_15>1537.50</P_15>');
  });

  it('should generate FaWiersz for each line item', async () => {
    const result = await generator.generate(makeKsefInvoice());
    expect(result.xmlContent).toContain('<NrWierszaFa>1</NrWierszaFa>');
    expect(result.xmlContent).toContain('<NrWierszaFa>2</NrWierszaFa>');
    expect(result.xmlContent).toContain('<P_7>Usługa doradcza</P_7>');
    expect(result.xmlContent).toContain('<P_8B>10</P_8B>');
    expect(result.xmlContent).toContain('<P_9A>100.00</P_9A>');
    expect(result.xmlContent).toContain('<P_11>1000.00</P_11>');
    expect(result.xmlContent).toContain('<P_12>23</P_12>');
  });

  it('should include tax rate summaries (P_13_1, P_14_1)', async () => {
    const result = await generator.generate(makeKsefInvoice());
    expect(result.xmlContent).toContain('<P_13_1>1250.00</P_13_1>');
    expect(result.xmlContent).toContain('<P_14_1>287.50</P_14_1>');
  });

  it('should handle 8% tax rate (P_13_2, P_14_2)', async () => {
    const invoice = makeKsefInvoice({
      lineItems: [
        { description: 'Food item', quantity: 1, unitPrice: 100, totalPrice: 100, taxRate: 8 },
      ],
    });
    const result = await generator.generate(invoice);
    expect(result.xmlContent).toContain('<P_13_2>100.00</P_13_2>');
    expect(result.xmlContent).toContain('<P_14_2>8.00</P_14_2>');
  });

  it('should include payment info with IBAN', async () => {
    const result = await generator.generate(makeKsefInvoice());
    expect(result.xmlContent).toContain('<Platnosc>');
    expect(result.xmlContent).toContain('<TerminPlatnosci>2024-08-15</TerminPlatnosci>');
    expect(result.xmlContent).toContain('<FormaPlatnosci>6</FormaPlatnosci>');
    expect(result.xmlContent).toContain('<NrRB>PL61109010140000071219812874</NrRB>');
  });

  it('should include P_16 and P_17 flags', async () => {
    const result = await generator.generate(makeKsefInvoice());
    expect(result.xmlContent).toContain('<P_16>2</P_16>');
    expect(result.xmlContent).toContain('<P_17>2</P_17>');
  });

  it('should generate correct filename', async () => {
    const result = await generator.generate(makeKsefInvoice());
    expect(result.fileName).toContain('ksef.xml');
  });

  it('should pass structural validation', async () => {
    const result = await generator.generate(makeKsefInvoice());
    const validation = await generator.validate(result.xmlContent);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('should handle buyer without NIP (name only)', async () => {
    const invoice = makeKsefInvoice({
      buyer: {
        name: 'Jan Kowalski',
        address: 'ul. Prywatna 1',
        city: 'Gdańsk',
        postalCode: '80-001',
        countryCode: 'PL',
      },
    });
    const result = await generator.generate(invoice);
    expect(result.xmlContent).toContain('<Nazwa>Jan Kowalski</Nazwa>');
    expect(result.xmlContent).toContain('<Podmiot2>');
  });
});

// ─── Validation Tests ────────────────────────────────────────────────────────

describe('KSeF Validation Rules', () => {
  it('should pass validation for a valid invoice', () => {
    const errors = validateKsefRules(makeKsefInvoice());
    expect(errors).toHaveLength(0);
  });

  it('should fail when seller NIP is missing', () => {
    const invoice = makeKsefInvoice({
      seller: { name: 'Test', vatId: null, taxNumber: null },
    });
    const errors = validateKsefRules(invoice);
    const nipError = errors.find((e) => e.ruleId === 'KSEF-01');
    expect(nipError).toBeDefined();
  });

  it('should fail when seller NIP is too short', () => {
    const invoice = makeKsefInvoice({
      seller: { name: 'Test', vatId: 'PL12345' },
    });
    const errors = validateKsefRules(invoice);
    expect(errors.find((e) => e.ruleId === 'KSEF-01')).toBeDefined();
  });

  it('should fail when buyer has no NIP and no name', () => {
    const invoice = makeKsefInvoice({
      buyer: { name: '', vatId: null },
    });
    const errors = validateKsefRules(invoice);
    expect(errors.find((e) => e.ruleId === 'KSEF-02')).toBeDefined();
  });

  it('should pass when buyer has name but no NIP', () => {
    const invoice = makeKsefInvoice({
      buyer: { name: 'Jan Kowalski' },
    });
    const errors = validateKsefRules(invoice);
    expect(errors.find((e) => e.ruleId === 'KSEF-02')).toBeUndefined();
  });

  it('should fail when invoice number is missing', () => {
    const invoice = makeKsefInvoice({ invoiceNumber: '' });
    const errors = validateKsefRules(invoice);
    expect(errors.find((e) => e.ruleId === 'KSEF-03')).toBeDefined();
  });

  it('should fail when invoice number exceeds 256 chars', () => {
    const invoice = makeKsefInvoice({ invoiceNumber: 'A'.repeat(257) });
    const errors = validateKsefRules(invoice);
    expect(errors.find((e) => e.ruleId === 'KSEF-03')).toBeDefined();
  });

  it('should fail when issue date is missing', () => {
    const invoice = makeKsefInvoice({ invoiceDate: '' });
    const errors = validateKsefRules(invoice);
    expect(errors.find((e) => e.ruleId === 'KSEF-04')).toBeDefined();
  });

  it('should fail when currency is missing', () => {
    const invoice = makeKsefInvoice({ currency: '' });
    const errors = validateKsefRules(invoice);
    expect(errors.find((e) => e.ruleId === 'KSEF-05')).toBeDefined();
  });

  it('should fail when no line items', () => {
    const invoice = makeKsefInvoice({ lineItems: [] });
    const errors = validateKsefRules(invoice);
    expect(errors.find((e) => e.ruleId === 'KSEF-06')).toBeDefined();
  });

  it('should fail for invalid Polish tax rate', () => {
    const invoice = makeKsefInvoice({
      lineItems: [
        { description: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100, taxRate: 19 },
      ],
    });
    const errors = validateKsefRules(invoice);
    expect(errors.find((e) => e.ruleId === 'KSEF-08')).toBeDefined();
  });

  it('should accept 0% tax rate', () => {
    const invoice = makeKsefInvoice({
      lineItems: [
        { description: 'Export item', quantity: 1, unitPrice: 100, totalPrice: 100, taxRate: 0 },
      ],
    });
    const errors = validateKsefRules(invoice);
    expect(errors.find((e) => e.ruleId === 'KSEF-08')).toBeUndefined();
  });

  it('should fail when line item description is missing', () => {
    const invoice = makeKsefInvoice({
      lineItems: [{ description: '', quantity: 1, unitPrice: 100, totalPrice: 100, taxRate: 23 }],
    });
    const errors = validateKsefRules(invoice);
    expect(
      errors.find((e) => e.ruleId === 'KSEF-07' && e.location.includes('description'))
    ).toBeDefined();
  });
});

// ─── Additional Coverage ─────────────────────────────────────────────────────

describe('KSeF Additional Coverage', () => {
  let generator: KsefGenerator;

  beforeEach(() => {
    generator = new KsefGenerator();
  });

  it('handles credit note (documentTypeCode 381)', async () => {
    const invoice = makeKsefInvoice({
      documentTypeCode: 381,
      precedingInvoiceReference: 'FV/2024/000',
    });
    const result = await generator.generate(invoice);
    expect(result.xmlContent).toBeTruthy();
    // Should still produce valid XML
    expect(result.xmlContent).toContain('<Fa>');
  });

  it('handles special characters in description (XML escaping)', async () => {
    const invoice = makeKsefInvoice({
      lineItems: [
        {
          description: 'Usługa <test> & "special"',
          quantity: 1,
          unitPrice: 100,
          totalPrice: 100,
          taxRate: 23,
          unitCode: 'C62',
        },
      ],
      totals: { subtotal: 100, taxAmount: 23, totalAmount: 123 },
    });
    const result = await generator.generate(invoice);
    expect(result.xmlContent).not.toContain('<test>');
    expect(result.xmlContent).toContain('&amp;');
  });

  it('handles empty optional fields (no payment)', async () => {
    const invoice = makeKsefInvoice({
      payment: {},
    });
    const result = await generator.generate(invoice);
    expect(result.xmlContent).toBeTruthy();
    expect(result.xmlContent).toContain('<Fa>');
  });

  it('defaults undefined taxRate to 0% (not 23%)', async () => {
    const invoice = makeKsefInvoice({
      lineItems: [
        {
          description: 'No rate item',
          quantity: 1,
          unitPrice: 100,
          totalPrice: 100,
          unitCode: 'C62',
        },
      ],
    });
    const result = await generator.generate(invoice);
    expect(result.xmlContent).toContain('<P_12>0</P_12>');
    expect(result.xmlContent).not.toContain('<P_12>23</P_12>');
    expect(result.xmlContent).toContain('<P_13_6_1>100.00</P_13_6_1>');
  });

  it('non-standard rate (19%) produces correct P_12 with no P_13_1/P_14_1', async () => {
    const invoice = makeKsefInvoice({
      lineItems: [
        {
          description: 'German service',
          quantity: 1,
          unitPrice: 500,
          totalPrice: 500,
          taxRate: 19,
          unitCode: 'C62',
        },
      ],
      totals: { subtotal: 500, taxAmount: 95, totalAmount: 595 },
    });
    const result = await generator.generate(invoice);
    expect(result.xmlContent).toContain('<P_12>19</P_12>');
    expect(result.xmlContent).not.toContain('<P_13_1>');
    expect(result.xmlContent).not.toContain('<P_14_1>');
    expect(result.xmlContent).toContain('<P_15>595.00</P_15>');
  });

  it('emits validation warning for non-standard tax rates', async () => {
    const invoice = makeKsefInvoice({
      lineItems: [
        {
          description: 'German item',
          quantity: 1,
          unitPrice: 100,
          totalPrice: 100,
          taxRate: 19,
          unitCode: 'C62',
        },
      ],
      totals: { subtotal: 100, taxAmount: 19, totalAmount: 119 },
    });
    const result = await generator.generate(invoice);
    expect(result.validationWarnings.length).toBeGreaterThan(0);
    expect(result.validationWarnings[0]).toContain('19%');
    expect(result.validationWarnings[0]).toContain('not a standard Polish VAT rate');
  });

  it('handles 5% tax rate (P_13_3, P_14_3)', async () => {
    const invoice = makeKsefInvoice({
      lineItems: [
        { description: 'Book', quantity: 1, unitPrice: 100, totalPrice: 100, taxRate: 5 },
      ],
    });
    const result = await generator.generate(invoice);
    expect(result.xmlContent).toContain('<P_13_3>100.00</P_13_3>');
    expect(result.xmlContent).toContain('<P_14_3>5.00</P_14_3>');
  });

  it('handles 0% tax rate (P_13_6)', async () => {
    const invoice = makeKsefInvoice({
      lineItems: [
        { description: 'Export service', quantity: 1, unitPrice: 200, totalPrice: 200, taxRate: 0 },
      ],
    });
    const result = await generator.generate(invoice);
    expect(result.xmlContent).toContain('<P_13_6_1>200.00</P_13_6_1>');
  });
});

// ─── Factory Tests ───────────────────────────────────────────────────────────

describe('KSeF Factory Integration', () => {
  beforeEach(() => {
    GeneratorFactory.clear();
  });

  it('should create ksef generator via factory', () => {
    const gen = GeneratorFactory.create('ksef');
    expect(gen).toBeInstanceOf(KsefGenerator);
    expect(gen.formatId).toBe('ksef');
  });

  it('should include ksef in available formats', () => {
    const formats = GeneratorFactory.getAvailableFormats();
    expect(formats).toContain('ksef');
  });

  it('should return profile validator for ksef', () => {
    const validator = getProfileValidator('ksef');
    expect(validator.profileId).toBe('ksef');
    expect(validator.profileName).toContain('KSeF');
  });

  it('should include ksef in available profiles', () => {
    const profiles = getAvailableProfiles();
    expect(profiles).toContain('ksef');
  });
});
