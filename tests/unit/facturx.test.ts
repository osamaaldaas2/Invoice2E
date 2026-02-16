/**
 * Factur-X — comprehensive unit tests.
 * Covers: generator output (PDF + embedded XML), validation rules, factory registration.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { GeneratorFactory } from '@/services/format/GeneratorFactory';
import { FacturXGenerator } from '@/services/format/facturx/facturx.generator';
import { validateForProfile } from '@/validation/validation-pipeline';
import { getProfileValidator } from '@/validation/ProfileValidatorFactory';
import type { CanonicalInvoice } from '@/types/canonical-invoice';

// ─── Test Helper ─────────────────────────────────────────────────────────────

/** Create a valid Factur-X CanonicalInvoice for testing. */
function makeFacturXInvoice(overrides?: Partial<CanonicalInvoice>): CanonicalInvoice {
  return {
    outputFormat: 'facturx-en16931',
    invoiceNumber: 'FX-2024-001',
    invoiceDate: '2024-07-01',
    currency: 'EUR',
    buyerReference: 'PO-2024-42',
    notes: 'Factur-X test invoice',
    seller: {
      name: 'Société Française SARL',
      email: 'facturation@societe.fr',
      address: '12 Rue de la Paix',
      city: 'Paris',
      postalCode: '75002',
      countryCode: 'FR',
      vatId: 'FR12345678901',
      contactName: 'Jean Dupont',
      phone: '+33 1 23 45 67 89',
    },
    buyer: {
      name: 'Deutsche Käufer GmbH',
      email: 'einkauf@kaeufer.de',
      address: 'Hauptstraße 10',
      city: 'Berlin',
      postalCode: '10115',
      countryCode: 'DE',
    },
    payment: {
      iban: 'FR7630006000011234567890189',
      bic: 'BNPAFRPP',
      paymentTerms: 'Net 30 days',
      dueDate: '2024-07-31',
    },
    lineItems: [
      {
        description: 'Consulting Services',
        quantity: 10,
        unitPrice: 150,
        totalPrice: 1500,
        taxRate: 20,
        taxCategoryCode: 'S',
        unitCode: 'HUR',
      },
      {
        description: 'Software License',
        quantity: 1,
        unitPrice: 500,
        totalPrice: 500,
        taxRate: 20,
        taxCategoryCode: 'S',
        unitCode: 'C62',
      },
    ],
    totals: {
      subtotal: 2000,
      taxAmount: 400,
      totalAmount: 2400,
    },
    taxRate: 20,
    ...overrides,
  };
}

// ─── Generator Tests ─────────────────────────────────────────────────────────

describe('FacturXGenerator', () => {
  let generatorEN16931: FacturXGenerator;
  let generatorBasic: FacturXGenerator;

  beforeEach(() => {
    generatorEN16931 = new FacturXGenerator('facturx-en16931');
    generatorBasic = new FacturXGenerator('facturx-basic');
  });

  it('has correct formatId and formatName for EN16931', () => {
    expect(generatorEN16931.formatId).toBe('facturx-en16931');
    expect(generatorEN16931.formatName).toContain('EN 16931');
  });

  it('has correct formatId and formatName for BASIC', () => {
    expect(generatorBasic.formatId).toBe('facturx-basic');
    expect(generatorBasic.formatName).toContain('Basic');
  });

  it('generates PDF output with pdfContent buffer', async () => {
    const result = await generatorEN16931.generate(makeFacturXInvoice());
    expect(result.pdfContent).toBeDefined();
    expect(result.pdfContent).toBeInstanceOf(Buffer);
    expect(result.pdfContent!.length).toBeGreaterThan(100);
    expect(result.mimeType).toBe('application/pdf');
  });

  it('generates valid PDF that pdf-lib can parse', async () => {
    const result = await generatorEN16931.generate(makeFacturXInvoice());
    // Convert to Uint8Array for pdf-lib compatibility
    const bytes = new Uint8Array(result.pdfContent!);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(0);
  });

  it('PDF filename ends with _facturx.pdf', async () => {
    const result = await generatorEN16931.generate(makeFacturXInvoice());
    expect(result.fileName).toBe('FX-2024-001_facturx.pdf');
  });

  it('fileSize matches pdfContent length', async () => {
    const result = await generatorEN16931.generate(makeFacturXInvoice());
    expect(result.fileSize).toBe(result.pdfContent!.length);
  });

  it('also produces xmlContent with CII XML', async () => {
    const result = await generatorEN16931.generate(makeFacturXInvoice());
    expect(result.xmlContent).toContain('CrossIndustryInvoice');
    expect(result.xmlContent).toContain('ram:');
  });

  it('embedded XML has correct Factur-X EN16931 SpecificationID', async () => {
    const result = await generatorEN16931.generate(makeFacturXInvoice());
    expect(result.xmlContent).toContain(
      'urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:en16931'
    );
  });

  it('embedded XML has correct Factur-X BASIC SpecificationID', async () => {
    const result = await generatorBasic.generate(makeFacturXInvoice({ outputFormat: 'facturx-basic' }));
    expect(result.xmlContent).toContain(
      'urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic'
    );
  });

  it('does NOT contain XRechnung SpecificationID', async () => {
    const result = await generatorEN16931.generate(makeFacturXInvoice());
    expect(result.xmlContent).not.toContain(
      'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0'
    );
  });

  it('includes standard invoice fields in XML', async () => {
    const result = await generatorEN16931.generate(makeFacturXInvoice());
    const xml = result.xmlContent;
    expect(xml).toContain('FX-2024-001');
    expect(xml).toContain('20240701'); // CII format 102: YYYYMMDD
    expect(xml).toContain('EUR');
    expect(xml).toContain('Consulting Services');
    expect(xml).toContain('Software License');
  });

  it('includes seller and buyer info in XML', async () => {
    const result = await generatorEN16931.generate(makeFacturXInvoice());
    const xml = result.xmlContent;
    expect(xml).toContain('Société Française SARL');
    expect(xml).toContain('Deutsche Käufer GmbH');
  });

  it('handles credit notes (TypeCode 381)', async () => {
    const creditNote = makeFacturXInvoice({
      documentTypeCode: 381,
      precedingInvoiceReference: 'FX-2024-000',
      totals: { subtotal: -2000, taxAmount: -400, totalAmount: -2400 },
    });
    const result = await generatorEN16931.generate(creditNote);
    expect(result.xmlContent).toContain('381');
    expect(result.pdfContent).toBeDefined();
  });

  it('handles non-EUR currency (USD)', async () => {
    const invoice = makeFacturXInvoice({ currency: 'USD' });
    const result = await generatorEN16931.generate(invoice);
    expect(result.xmlContent).toContain('USD');
  });

  it('handles GBP currency', async () => {
    const result = await generatorEN16931.generate(makeFacturXInvoice({ currency: 'GBP' }));
    expect(result.xmlContent).toContain('GBP');
  });

  it('handles allowances/charges', async () => {
    const invoice = makeFacturXInvoice({
      allowanceCharges: [
        {
          chargeIndicator: false,
          amount: 200,
          reason: 'Early payment discount',
          taxRate: 20,
          taxCategoryCode: 'S',
        },
      ],
      totals: { subtotal: 1800, taxAmount: 360, totalAmount: 2160 },
    });
    const result = await generatorEN16931.generate(invoice);
    expect(result.xmlContent).toContain('AllowanceCharge');
  });

  it('visual PDF has at least one page', async () => {
    const result = await generatorEN16931.generate(makeFacturXInvoice());
    const bytes = new Uint8Array(result.pdfContent!);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  describe('validate()', () => {
    it('passes for valid Factur-X XML', async () => {
      const result = await generatorEN16931.generate(makeFacturXInvoice());
      const validation = await generatorEN16931.validate(result.xmlContent);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });
});

// ─── Validation Pipeline Tests (Factur-X profiles) ──────────────────────────

describe('Factur-X validation rules', () => {
  it('valid Factur-X EN16931 invoice passes all rules', () => {
    const result = validateForProfile(makeFacturXInvoice(), 'facturx-en16931');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('valid Factur-X BASIC invoice passes all rules', () => {
    const invoice = makeFacturXInvoice({ outputFormat: 'facturx-basic' });
    const result = validateForProfile(invoice, 'facturx-basic');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('FX-COMMON-003: missing seller name fails', () => {
    const invoice = makeFacturXInvoice();
    invoice.seller = { ...invoice.seller, name: '' };
    const result = validateForProfile(invoice, 'facturx-en16931');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.ruleId === 'FX-COMMON-003' || e.ruleId === 'SCHEMA-003')).toBe(true);
  });

  it('FX-COMMON-005: missing buyer name fails', () => {
    const invoice = makeFacturXInvoice();
    invoice.buyer = { ...invoice.buyer, name: '' };
    const result = validateForProfile(invoice, 'facturx-en16931');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.ruleId === 'FX-COMMON-005' || e.ruleId === 'SCHEMA-004')).toBe(true);
  });

  it('non-EUR currency PASSES (no EUR restriction unlike XRechnung)', () => {
    const invoice = makeFacturXInvoice({ currency: 'USD' });
    const result = validateForProfile(invoice, 'facturx-en16931');
    expect(result.valid).toBe(true);
  });

  it('no Leitweg-ID requirement (unlike XRechnung)', () => {
    const invoice = makeFacturXInvoice({ buyerReference: undefined });
    const result = validateForProfile(invoice, 'facturx-en16931');
    // Should not have any BR-DE errors about Leitweg-ID
    expect(result.errors.some((e) => e.ruleId.startsWith('BR-DE'))).toBe(false);
  });

  it('FX-COMMON-001: invalid document type code fails', () => {
    const invoice = makeFacturXInvoice({ documentTypeCode: 999 as any });
    const result = validateForProfile(invoice, 'facturx-en16931');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.ruleId === 'FX-COMMON-001')).toBe(true);
  });

  it('FX-COMMON-002: missing line items fails', () => {
    const invoice = makeFacturXInvoice({ lineItems: [] });
    const result = validateForProfile(invoice, 'facturx-en16931');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.ruleId === 'FX-COMMON-002' || e.ruleId === 'SCHEMA-006')).toBe(true);
  });

  it('FX-COMMON-011: missing seller tax identifiers fails', () => {
    const invoice = makeFacturXInvoice();
    invoice.seller = { ...invoice.seller, vatId: undefined, taxNumber: undefined, taxId: undefined };
    const result = validateForProfile(invoice, 'facturx-en16931');
    expect(result.errors.some((e) => e.ruleId === 'FX-COMMON-011')).toBe(true);
  });

  it('FX-COMMON-010: credit note without preceding reference fails', () => {
    const invoice = makeFacturXInvoice({
      documentTypeCode: 381,
      precedingInvoiceReference: undefined,
      totals: { subtotal: -2000, taxAmount: -400, totalAmount: -2400 },
    });
    const result = validateForProfile(invoice, 'facturx-en16931');
    expect(result.errors.some((e) => e.ruleId === 'FX-COMMON-010')).toBe(true);
  });

  it('FX-COMMON-009: invalid tax category code fails', () => {
    const invoice = makeFacturXInvoice();
    invoice.lineItems = [
      { description: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100, taxRate: 20, taxCategoryCode: 'XX' as any },
    ];
    const result = validateForProfile(invoice, 'facturx-en16931');
    expect(result.errors.some((e) => e.ruleId === 'FX-COMMON-009')).toBe(true);
  });

  it('BASIC profile passes without payment terms (unlike EN16931)', () => {
    const invoice = makeFacturXInvoice({
      outputFormat: 'facturx-basic',
      payment: { iban: 'FR7630006000011234567890189' },
    });
    const result = validateForProfile(invoice, 'facturx-basic');
    // BASIC doesn't require payment terms/due date
    expect(result.errors.some((e) => e.ruleId === 'FX-EN16931-001')).toBe(false);
  });

  it('collects multiple Factur-X errors in one pass', () => {
    const invoice = makeFacturXInvoice();
    invoice.seller = { ...invoice.seller, name: '', vatId: undefined, taxId: undefined, taxNumber: undefined, countryCode: undefined };
    invoice.buyer = { ...invoice.buyer, name: '' };
    const result = validateForProfile(invoice, 'facturx-en16931');
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── Factory Tests ───────────────────────────────────────────────────────────

describe('Factur-X factory registration', () => {
  beforeEach(() => {
    GeneratorFactory.clear();
  });

  it('GeneratorFactory.create("facturx-en16931") returns FacturXGenerator', () => {
    const gen = GeneratorFactory.create('facturx-en16931');
    expect(gen.formatId).toBe('facturx-en16931');
    expect(gen.formatName).toContain('EN 16931');
  });

  it('GeneratorFactory.create("facturx-basic") returns FacturXGenerator', () => {
    const gen = GeneratorFactory.create('facturx-basic');
    expect(gen.formatId).toBe('facturx-basic');
    expect(gen.formatName).toContain('Basic');
  });

  it('"facturx-en16931" is in available formats list', () => {
    const formats = GeneratorFactory.getAvailableFormats();
    expect(formats).toContain('facturx-en16931');
  });

  it('"facturx-basic" is in available formats list', () => {
    const formats = GeneratorFactory.getAvailableFormats();
    expect(formats).toContain('facturx-basic');
  });

  it('returns cached singleton for facturx-en16931', () => {
    const g1 = GeneratorFactory.create('facturx-en16931');
    const g2 = GeneratorFactory.create('facturx-en16931');
    expect(g1).toBe(g2);
  });

  it('getProfileValidator("facturx-en16931") returns Factur-X EN16931 validator', () => {
    const validator = getProfileValidator('facturx-en16931');
    expect(validator.profileId).toBe('facturx-en16931');
    expect(validator.profileName).toContain('EN 16931');
  });

  it('getProfileValidator("facturx-basic") returns Factur-X BASIC validator', () => {
    const validator = getProfileValidator('facturx-basic');
    expect(validator.profileId).toBe('facturx-basic');
    expect(validator.profileName).toContain('BASIC');
  });
});
