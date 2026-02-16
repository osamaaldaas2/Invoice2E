/**
 * PEPPOL BIS Billing 3.0 — comprehensive unit tests.
 * Covers: generator output, validation rules, factory registration.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GeneratorFactory } from '@/services/format/GeneratorFactory';
import { PeppolBISGenerator } from '@/services/format/peppol/peppol-bis.generator';
import { validateForProfile } from '@/validation/validation-pipeline';
import { getProfileValidator } from '@/validation/ProfileValidatorFactory';
import type { CanonicalInvoice } from '@/types/canonical-invoice';

// ─── Test Helper ─────────────────────────────────────────────────────────────

/** Create a valid PEPPOL BIS CanonicalInvoice with non-EUR currency & EndpointIDs. */
function makePeppolInvoice(overrides?: Partial<CanonicalInvoice>): CanonicalInvoice {
  return {
    outputFormat: 'peppol-bis',
    invoiceNumber: 'PEPP-2024-001',
    invoiceDate: '2024-06-15',
    currency: 'SEK',
    buyerReference: 'ORDER-REF-42',
    notes: 'PEPPOL test invoice',
    seller: {
      name: 'Nordic Supplies AB',
      email: 'billing@nordic.se',
      electronicAddress: '0088:7300010000001',
      electronicAddressScheme: '0088',
      address: 'Storgatan 12',
      city: 'Stockholm',
      postalCode: '11122',
      countryCode: 'SE',
      vatId: 'SE556677889901',
      contactName: 'Erik Svensson',
      phone: '+46 8 555 1234',
    },
    buyer: {
      name: 'Danish Import A/S',
      email: 'ap@danish-import.dk',
      electronicAddress: '0184:DK12345678',
      electronicAddressScheme: '0184',
      address: 'Vestergade 7',
      city: 'Copenhagen',
      postalCode: '1456',
      countryCode: 'DK',
    },
    payment: {
      iban: 'SE3550000000054910000003',
      bic: 'ESSESESS',
      paymentTerms: 'Net 30 days',
      dueDate: '2024-07-15',
    },
    lineItems: [
      {
        description: 'Office Chair Model X',
        quantity: 5,
        unitPrice: 2000,
        totalPrice: 10000,
        taxRate: 25,
        taxCategoryCode: 'S',
        unitCode: 'C62',
      },
      {
        description: 'Desk Lamp LED',
        quantity: 10,
        unitPrice: 500,
        totalPrice: 5000,
        taxRate: 25,
        taxCategoryCode: 'S',
        unitCode: 'C62',
      },
    ],
    totals: {
      subtotal: 15000,
      taxAmount: 3750,
      totalAmount: 18750,
    },
    taxRate: 25,
    ...overrides,
  };
}

// ─── Generator Tests ─────────────────────────────────────────────────────────

describe('PeppolBISGenerator', () => {
  let generator: PeppolBISGenerator;

  beforeEach(() => {
    generator = new PeppolBISGenerator();
  });

  it('has correct formatId and formatName', () => {
    expect(generator.formatId).toBe('peppol-bis');
    expect(generator.formatName).toBe('PEPPOL BIS Billing 3.0');
  });

  it('generates valid UBL 2.1 XML', async () => {
    const result = await generator.generate(makePeppolInvoice());
    expect(result.xmlContent).toContain('xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"');
    expect(result.xmlContent).toContain('xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"');
  });

  it('has correct PEPPOL CustomizationID', async () => {
    const result = await generator.generate(makePeppolInvoice());
    expect(result.xmlContent).toContain(
      'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0'
    );
  });

  it('does NOT contain XRechnung CustomizationID', async () => {
    const result = await generator.generate(makePeppolInvoice());
    expect(result.xmlContent).not.toContain(
      'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0'
    );
  });

  it('has correct ProfileID', async () => {
    const result = await generator.generate(makePeppolInvoice());
    expect(result.xmlContent).toContain(
      'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0'
    );
  });

  it('does NOT include Leitweg-ID', async () => {
    const result = await generator.generate(makePeppolInvoice());
    // Leitweg-ID format: 04011000-12345-67
    expect(result.xmlContent).not.toContain('04011000-');
  });

  it('handles non-EUR currency (SEK)', async () => {
    const result = await generator.generate(makePeppolInvoice({ currency: 'SEK' }));
    expect(result.xmlContent).toContain('SEK');
  });

  it('handles GBP currency', async () => {
    const result = await generator.generate(makePeppolInvoice({ currency: 'GBP' }));
    expect(result.xmlContent).toContain('GBP');
  });

  it('handles NOK currency', async () => {
    const result = await generator.generate(makePeppolInvoice({ currency: 'NOK' }));
    expect(result.xmlContent).toContain('NOK');
  });

  it('handles DKK currency', async () => {
    const result = await generator.generate(makePeppolInvoice({ currency: 'DKK' }));
    expect(result.xmlContent).toContain('DKK');
  });

  it('includes EndpointID elements', async () => {
    const result = await generator.generate(makePeppolInvoice());
    expect(result.xmlContent).toContain('EndpointID');
  });

  it('includes required elements: InvoiceNumber, IssueDate, Currency', async () => {
    const invoice = makePeppolInvoice();
    const result = await generator.generate(invoice);
    expect(result.xmlContent).toContain('PEPP-2024-001');
    expect(result.xmlContent).toContain('2024-06-15');
    expect(result.xmlContent).toContain('SEK');
  });

  it('includes line items', async () => {
    const result = await generator.generate(makePeppolInvoice());
    expect(result.xmlContent).toContain('Office Chair Model X');
    expect(result.xmlContent).toContain('Desk Lamp LED');
    expect(result.xmlContent).toContain('InvoiceLine');
  });

  it('generates credit notes (TypeCode 381) correctly', async () => {
    const creditNote = makePeppolInvoice({
      documentTypeCode: 381,
      precedingInvoiceReference: 'PEPP-2024-000',
      totals: { subtotal: -15000, taxAmount: -3750, totalAmount: -18750 },
    });
    const result = await generator.generate(creditNote);
    expect(result.xmlContent).toContain('381');
  });

  it('generates correct filename with _peppol suffix', async () => {
    const result = await generator.generate(makePeppolInvoice());
    expect(result.fileName).toBe('PEPP-2024-001_peppol.xml');
  });

  it('reports correct file size', async () => {
    const result = await generator.generate(makePeppolInvoice());
    expect(result.fileSize).toBe(new TextEncoder().encode(result.xmlContent).length);
  });

  it('handles allowances/charges', async () => {
    const invoice = makePeppolInvoice({
      allowanceCharges: [
        {
          chargeIndicator: false,
          amount: 500,
          reason: 'Volume discount',
          taxRate: 25,
          taxCategoryCode: 'S',
        },
      ],
      totals: { subtotal: 14500, taxAmount: 3625, totalAmount: 18125 },
    });
    const result = await generator.generate(invoice);
    expect(result.xmlContent).toContain('AllowanceCharge');
  });

  describe('validate()', () => {
    it('passes for valid PEPPOL XML', async () => {
      const result = await generator.generate(makePeppolInvoice());
      const validation = await generator.validate(result.xmlContent);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('fails when CustomizationID is missing', async () => {
      const validation = await generator.validate('<Invoice></Invoice>');
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('CustomizationID'))).toBe(true);
    });

    it('fails when EndpointID is missing', async () => {
      const xml = '<Invoice><CustomizationID>x</CustomizationID></Invoice>';
      const validation = await generator.validate(xml);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('EndpointID'))).toBe(true);
    });
  });
});

// ─── Validation Pipeline Tests (PEPPOL profile) ─────────────────────────────

describe('PEPPOL BIS validation rules', () => {
  it('valid PEPPOL invoice passes all rules', () => {
    const result = validateForProfile(makePeppolInvoice(), 'peppol-bis');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('PEPPOL-EN16931-R010: missing buyer EndpointID fails', () => {
    const invoice = makePeppolInvoice();
    invoice.buyer = { ...invoice.buyer, electronicAddress: undefined };
    const result = validateForProfile(invoice, 'peppol-bis');
    expect(result.errors.some((e) => e.ruleId === 'PEPPOL-EN16931-R010')).toBe(true);
  });

  it('PEPPOL-EN16931-R020: missing seller EndpointID fails', () => {
    const invoice = makePeppolInvoice();
    invoice.seller = { ...invoice.seller, electronicAddress: undefined };
    const result = validateForProfile(invoice, 'peppol-bis');
    expect(result.errors.some((e) => e.ruleId === 'PEPPOL-EN16931-R020')).toBe(true);
  });

  it('PEPPOL-EN16931-R010-SCHEME: invalid buyer endpoint scheme fails', () => {
    const invoice = makePeppolInvoice();
    invoice.buyer = { ...invoice.buyer, electronicAddressScheme: 'INVALID' };
    const result = validateForProfile(invoice, 'peppol-bis');
    expect(result.errors.some((e) => e.ruleId === 'PEPPOL-EN16931-R010-SCHEME')).toBe(true);
  });

  it('non-EUR currency PASSES (unlike XRechnung)', () => {
    const invoice = makePeppolInvoice({ currency: 'GBP' });
    const result = validateForProfile(invoice, 'peppol-bis');
    expect(result.valid).toBe(true);
  });

  it('missing Leitweg-ID (buyerReference) PASSES (unlike XRechnung)', () => {
    const invoice = makePeppolInvoice({ buyerReference: undefined });
    const result = validateForProfile(invoice, 'peppol-bis');
    // PEPPOL doesn't require Leitweg-ID
    expect(result.errors.some((e) => e.ruleId.startsWith('BR-DE'))).toBe(false);
  });

  it('PEPPOL-EN16931-CL001: invalid tax category code fails', () => {
    const invoice = makePeppolInvoice();
    invoice.lineItems = [
      { description: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100, taxRate: 19, taxCategoryCode: 'XX' as any },
    ];
    const result = validateForProfile(invoice, 'peppol-bis');
    expect(result.errors.some((e) => e.ruleId === 'PEPPOL-EN16931-CL001')).toBe(true);
  });

  it('PEPPOL-EN16931-R004: missing all seller tax identifiers fails', () => {
    const invoice = makePeppolInvoice();
    invoice.seller = { ...invoice.seller, vatId: undefined, taxNumber: undefined, taxId: undefined };
    const result = validateForProfile(invoice, 'peppol-bis');
    expect(result.errors.some((e) => e.ruleId === 'PEPPOL-EN16931-R004')).toBe(true);
  });

  it('PEPPOL-EN16931-R006: credit note without preceding reference fails', () => {
    const invoice = makePeppolInvoice({
      documentTypeCode: 381,
      precedingInvoiceReference: undefined,
      totals: { subtotal: -15000, taxAmount: -3750, totalAmount: -18750 },
    });
    const result = validateForProfile(invoice, 'peppol-bis');
    expect(result.errors.some((e) => e.ruleId === 'PEPPOL-EN16931-R006')).toBe(true);
  });

  it('PEPPOL-EN16931-CL005: invalid country code fails', () => {
    const invoice = makePeppolInvoice();
    invoice.seller = { ...invoice.seller, countryCode: 'XYZ' };
    const result = validateForProfile(invoice, 'peppol-bis');
    expect(result.errors.some((e) => e.ruleId === 'PEPPOL-EN16931-CL005')).toBe(true);
  });

  it('collects multiple PEPPOL errors in one pass', () => {
    const invoice = makePeppolInvoice();
    invoice.seller = { ...invoice.seller, electronicAddress: undefined, vatId: undefined, taxId: undefined, taxNumber: undefined };
    invoice.buyer = { ...invoice.buyer, electronicAddress: undefined };
    const result = validateForProfile(invoice, 'peppol-bis');
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── Factory Tests ───────────────────────────────────────────────────────────

describe('PEPPOL BIS factory registration', () => {
  beforeEach(() => {
    GeneratorFactory.clear();
  });

  it('GeneratorFactory.create("peppol-bis") returns PeppolBISGenerator', () => {
    const gen = GeneratorFactory.create('peppol-bis');
    expect(gen.formatId).toBe('peppol-bis');
    expect(gen.formatName).toBe('PEPPOL BIS Billing 3.0');
  });

  it('"peppol-bis" is in available formats list', () => {
    const formats = GeneratorFactory.getAvailableFormats();
    expect(formats).toContain('peppol-bis');
  });

  it('returns cached singleton for peppol-bis', () => {
    const g1 = GeneratorFactory.create('peppol-bis');
    const g2 = GeneratorFactory.create('peppol-bis');
    expect(g1).toBe(g2);
  });

  it('getProfileValidator("peppol-bis") returns PEPPOL validator', () => {
    const validator = getProfileValidator('peppol-bis');
    expect(validator.profileId).toBe('peppol-bis');
    expect(validator.profileName).toBe('PEPPOL BIS Billing 3.0');
  });
});
