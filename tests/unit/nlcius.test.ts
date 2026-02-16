/**
 * NLCIUS / SI-UBL 2.0 — comprehensive unit tests.
 * Covers: generator output, validation rules, factory registration.
 */

import { describe, it, expect } from 'vitest';
import { GeneratorFactory } from '@/services/format/GeneratorFactory';
import { NLCIUSGenerator } from '@/services/format/nlcius/nlcius.generator';
import { validateNLCIUSRules } from '@/validation/nlcius-rules';
import { getProfileValidator } from '@/validation/ProfileValidatorFactory';
import type { CanonicalInvoice } from '@/types/canonical-invoice';

const NLCIUS_CUSTOMIZATION_ID =
  'urn:cen.eu:en16931:2017#compliant#urn:fdc:nen.nl:nlcius:v1.0';

function makeNLCIUSInvoice(overrides?: Partial<CanonicalInvoice>): CanonicalInvoice {
  return {
    outputFormat: 'nlcius',
    invoiceNumber: 'NL-2024-001',
    invoiceDate: '2024-06-15',
    currency: 'EUR',
    buyerReference: 'PO-12345',
    seller: {
      name: 'Dutch Supplies B.V.',
      email: 'billing@dutch.nl',
      electronicAddress: '00000000000000000001',
      electronicAddressScheme: '0190',
      address: 'Keizersgracht 100',
      city: 'Amsterdam',
      postalCode: '1015 AA',
      countryCode: 'NL',
      vatId: 'NL123456789B01',
      contactName: 'Jan de Vries',
      phone: '+31 20 555 1234',
    },
    buyer: {
      name: 'Belgian Import NV',
      email: 'ap@belgian.be',
      electronicAddress: '12345678',
      electronicAddressScheme: '0106',
      address: 'Rue de la Loi 1',
      city: 'Brussels',
      postalCode: '1000',
      countryCode: 'BE',
      vatId: 'BE0123456789',
    },
    payment: {
      iban: 'NL91ABNA0417164300',
      bic: 'ABNANL2A',
      paymentTerms: 'Net 30 days',
      dueDate: '2024-07-15',
    },
    lineItems: [
      {
        description: 'Consulting Services',
        quantity: 10,
        unitPrice: 150,
        totalPrice: 1500,
        taxRate: 21,
        taxCategoryCode: 'S',
        unitCode: 'HUR',
      },
    ],
    totals: {
      subtotal: 1500,
      taxAmount: 315,
      totalAmount: 1815,
    },
    ...overrides,
  };
}

// ─── Generator Tests ──────────────────────────────────────────────────────────

describe('NLCIUSGenerator', () => {
  const generator = new NLCIUSGenerator();

  it('should have correct formatId and formatName', () => {
    expect(generator.formatId).toBe('nlcius');
    expect(generator.formatName).toContain('NLCIUS');
  });

  it('should generate XML with NLCIUS customization ID', async () => {
    const invoice = makeNLCIUSInvoice();
    const result = await generator.generate(invoice);
    expect(result.xmlContent).toContain(NLCIUS_CUSTOMIZATION_ID);
  });

  it('should NOT contain PEPPOL customization ID', async () => {
    const invoice = makeNLCIUSInvoice();
    const result = await generator.generate(invoice);
    expect(result.xmlContent).not.toContain('urn:fdc:peppol.eu:2017:poacc:billing:3.0');
  });

  it('should generate valid UBL XML structure', async () => {
    const invoice = makeNLCIUSInvoice();
    const result = await generator.generate(invoice);
    expect(result.xmlContent).toContain('Invoice');
    expect(result.xmlContent).toContain('AccountingSupplierParty');
    expect(result.xmlContent).toContain('AccountingCustomerParty');
  });

  it('should produce _nlcius file name', async () => {
    const invoice = makeNLCIUSInvoice();
    const result = await generator.generate(invoice);
    expect(result.fileName).toBe('NL-2024-001_nlcius.xml');
  });

  it('should set fileSize correctly', async () => {
    const invoice = makeNLCIUSInvoice();
    const result = await generator.generate(invoice);
    expect(result.fileSize).toBe(new TextEncoder().encode(result.xmlContent).length);
  });
});

// ─── Validation Tests ──────────────────────────────────────────────────────────

describe('NLCIUS Validation Rules', () => {
  it('should pass with valid Dutch invoice', () => {
    const invoice = makeNLCIUSInvoice();
    const errors = validateNLCIUSRules(invoice);
    expect(errors).toHaveLength(0);
  });

  it('should reject invalid OIN (not 20 digits)', () => {
    const invoice = makeNLCIUSInvoice({
      seller: {
        ...makeNLCIUSInvoice().seller,
        electronicAddress: '12345',
        electronicAddressScheme: '0190',
      },
    });
    const errors = validateNLCIUSRules(invoice);
    const oinError = errors.find((e) => e.ruleId === 'NLCIUS-OIN-FORMAT');
    expect(oinError).toBeDefined();
  });

  it('should accept valid 20-digit OIN', () => {
    const invoice = makeNLCIUSInvoice();
    const errors = validateNLCIUSRules(invoice);
    const oinError = errors.find((e) => e.ruleId === 'NLCIUS-OIN-FORMAT');
    expect(oinError).toBeUndefined();
  });

  it('should reject invalid KVK (not 8 digits)', () => {
    const invoice = makeNLCIUSInvoice({
      buyer: {
        ...makeNLCIUSInvoice().buyer,
        electronicAddress: '123',
        electronicAddressScheme: '0106',
      },
    });
    const errors = validateNLCIUSRules(invoice);
    const kvkError = errors.find((e) => e.ruleId === 'NLCIUS-KVK-FORMAT');
    expect(kvkError).toBeDefined();
  });

  it('should accept valid 8-digit KVK', () => {
    const invoice = makeNLCIUSInvoice();
    const errors = validateNLCIUSRules(invoice);
    const kvkError = errors.find((e) => e.ruleId === 'NLCIUS-KVK-FORMAT');
    expect(kvkError).toBeUndefined();
  });

  it('should reject invalid Dutch BTW format', () => {
    const invoice = makeNLCIUSInvoice({
      seller: {
        ...makeNLCIUSInvoice().seller,
        vatId: 'NL12345',
      },
    });
    const errors = validateNLCIUSRules(invoice);
    const btwError = errors.find((e) => e.ruleId === 'NLCIUS-BTW-FORMAT');
    expect(btwError).toBeDefined();
  });

  it('should accept valid Dutch BTW format', () => {
    const invoice = makeNLCIUSInvoice();
    const errors = validateNLCIUSRules(invoice);
    const btwError = errors.find((e) => e.ruleId === 'NLCIUS-BTW-FORMAT');
    expect(btwError).toBeUndefined();
  });

  it('should include PEPPOL rules (missing endpoint)', () => {
    const invoice = makeNLCIUSInvoice({
      seller: {
        ...makeNLCIUSInvoice().seller,
        electronicAddress: '',
      },
    });
    const errors = validateNLCIUSRules(invoice);
    const peppolError = errors.find((e) => e.ruleId === 'PEPPOL-EN16931-R020');
    expect(peppolError).toBeDefined();
  });
});

// ─── Additional Coverage ────────────────────────────────────────────────────

describe('NLCIUS Additional Coverage', () => {
  const generator = new NLCIUSGenerator();

  it('handles credit note (documentTypeCode 381)', async () => {
    const invoice = makeNLCIUSInvoice({
      documentTypeCode: 381,
      precedingInvoiceReference: 'NL-2024-000',
      totals: { subtotal: -1500, taxAmount: -315, totalAmount: -1815 },
    });
    const result = await generator.generate(invoice);
    expect(result.xmlContent).toContain('381');
    expect(result.xmlContent).toBeTruthy();
  });

  it('handles non-EUR currency (USD)', async () => {
    const invoice = makeNLCIUSInvoice({ currency: 'USD' });
    const result = await generator.generate(invoice);
    expect(result.xmlContent).toContain('USD');
  });

  it('handles missing endpoint IDs without crashing', async () => {
    const invoice = makeNLCIUSInvoice({
      seller: {
        ...makeNLCIUSInvoice().seller,
        electronicAddress: undefined,
        electronicAddressScheme: undefined,
      },
      buyer: {
        ...makeNLCIUSInvoice().buyer,
        electronicAddress: undefined,
        electronicAddressScheme: undefined,
      },
    });
    const result = await generator.generate(invoice);
    expect(result.xmlContent).toBeTruthy();
  });
});

// ─── Factory Tests ──────────────────────────────────────────────────────────

describe('NLCIUS Factory Registration', () => {
  it('should be available via GeneratorFactory', () => {
    const generator = GeneratorFactory.create('nlcius');
    expect(generator.formatId).toBe('nlcius');
  });

  it('should be listed in available formats', () => {
    const formats = GeneratorFactory.getAvailableFormats();
    expect(formats).toContain('nlcius');
  });

  it('should have a profile validator', () => {
    const validator = getProfileValidator('nlcius');
    expect(validator.profileId).toBe('nlcius');
  });
});
