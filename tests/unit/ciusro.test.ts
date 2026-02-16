/**
 * CIUS-RO (Romania) — comprehensive unit tests.
 * Covers: generator output, validation rules, factory registration.
 */

import { describe, it, expect } from 'vitest';
import { GeneratorFactory } from '@/services/format/GeneratorFactory';
import { CIUSROGenerator } from '@/services/format/ciusro/ciusro.generator';
import { validateCIUSRORules } from '@/validation/ciusro-rules';
import { getProfileValidator } from '@/validation/ProfileValidatorFactory';
import type { CanonicalInvoice } from '@/types/canonical-invoice';

const CIUSRO_CUSTOMIZATION_ID =
  'urn:cen.eu:en16931:2017#compliant#urn:efactura.mfinante.ro:CIUS-RO:1.0.1';

function makeCIUSROInvoice(overrides?: Partial<CanonicalInvoice>): CanonicalInvoice {
  return {
    outputFormat: 'cius-ro',
    invoiceNumber: 'RO-2024-001',
    invoiceDate: '2024-06-15',
    currency: 'RON',
    buyerReference: 'CMD-54321',
    seller: {
      name: 'Romanian Tech SRL',
      email: 'facturi@rotech.ro',
      electronicAddress: '0184:RO12345678',
      electronicAddressScheme: '0184',
      address: 'Strada Victoriei 10',
      city: 'Bucharest',
      postalCode: '010061',
      countryCode: 'RO',
      vatId: 'RO12345678',
      taxNumber: 'RO12345678',
      contactName: 'Ion Popescu',
      phone: '+40 21 555 1234',
    },
    buyer: {
      name: 'Hungarian Import Kft.',
      email: 'ap@hungarian.hu',
      electronicAddress: '0184:HU98765432',
      electronicAddressScheme: '0184',
      address: 'Andrássy út 5',
      city: 'Budapest',
      postalCode: '1061',
      countryCode: 'HU',
      vatId: 'HU98765432',
    },
    payment: {
      iban: 'RO49AAAA1B31007593840000',
      bic: 'BTRLRO22',
      paymentTerms: 'Net 30 days',
      dueDate: '2024-07-15',
    },
    lineItems: [
      {
        description: 'Software License',
        quantity: 1,
        unitPrice: 5000,
        totalPrice: 5000,
        taxRate: 19,
        taxCategoryCode: 'S',
        unitCode: 'C62',
      },
    ],
    totals: {
      subtotal: 5000,
      taxAmount: 950,
      totalAmount: 5950,
    },
    ...overrides,
  };
}

// ─── Generator Tests ──────────────────────────────────────────────────────────

describe('CIUSROGenerator', () => {
  const generator = new CIUSROGenerator();

  it('should have correct formatId and formatName', () => {
    expect(generator.formatId).toBe('cius-ro');
    expect(generator.formatName).toContain('CIUS-RO');
  });

  it('should generate XML with CIUS-RO customization ID', async () => {
    const invoice = makeCIUSROInvoice();
    const result = await generator.generate(invoice);
    expect(result.xmlContent).toContain(CIUSRO_CUSTOMIZATION_ID);
  });

  it('should NOT contain PEPPOL customization ID', async () => {
    const invoice = makeCIUSROInvoice();
    const result = await generator.generate(invoice);
    expect(result.xmlContent).not.toContain('urn:fdc:peppol.eu:2017:poacc:billing:3.0');
  });

  it('should produce _ciusro file name', async () => {
    const invoice = makeCIUSROInvoice();
    const result = await generator.generate(invoice);
    expect(result.fileName).toBe('RO-2024-001_ciusro.xml');
  });
});

// ─── Validation Tests ──────────────────────────────────────────────────────────

describe('CIUS-RO Validation Rules', () => {
  it('should pass with valid Romanian invoice', () => {
    const invoice = makeCIUSROInvoice();
    const errors = validateCIUSRORules(invoice);
    expect(errors).toHaveLength(0);
  });

  it('should reject invalid CUI format', () => {
    const invoice = makeCIUSROInvoice({
      seller: {
        ...makeCIUSROInvoice().seller,
        taxNumber: 'INVALID123',
      },
    });
    const errors = validateCIUSRORules(invoice);
    const cuiError = errors.find((e) => e.ruleId === 'CIUS-RO-CUI-FORMAT');
    expect(cuiError).toBeDefined();
  });

  it('should accept CUI with RO prefix', () => {
    const invoice = makeCIUSROInvoice({
      seller: {
        ...makeCIUSROInvoice().seller,
        taxNumber: 'RO12345678',
      },
    });
    const errors = validateCIUSRORules(invoice);
    const cuiError = errors.find((e) => e.ruleId === 'CIUS-RO-CUI-FORMAT');
    expect(cuiError).toBeUndefined();
  });

  it('should accept CUI without RO prefix', () => {
    const invoice = makeCIUSROInvoice({
      seller: {
        ...makeCIUSROInvoice().seller,
        taxNumber: '12345678',
      },
    });
    const errors = validateCIUSRORules(invoice);
    const cuiError = errors.find((e) => e.ruleId === 'CIUS-RO-CUI-FORMAT');
    expect(cuiError).toBeUndefined();
  });

  it('should reject CUI with more than 10 digits', () => {
    const invoice = makeCIUSROInvoice({
      seller: {
        ...makeCIUSROInvoice().seller,
        taxNumber: 'RO12345678901',
      },
    });
    const errors = validateCIUSRORules(invoice);
    const cuiError = errors.find((e) => e.ruleId === 'CIUS-RO-CUI-FORMAT');
    expect(cuiError).toBeDefined();
  });

  it('should reject invalid RO VAT ID format', () => {
    const invoice = makeCIUSROInvoice({
      seller: {
        ...makeCIUSROInvoice().seller,
        vatId: 'RO1',
      },
    });
    const errors = validateCIUSRORules(invoice);
    const vatError = errors.find((e) => e.ruleId === 'CIUS-RO-VAT-FORMAT');
    expect(vatError).toBeDefined();
  });

  it('should include PEPPOL rules (missing endpoint)', () => {
    const invoice = makeCIUSROInvoice({
      seller: {
        ...makeCIUSROInvoice().seller,
        electronicAddress: '',
      },
    });
    const errors = validateCIUSRORules(invoice);
    const peppolError = errors.find((e) => e.ruleId === 'PEPPOL-EN16931-R020');
    expect(peppolError).toBeDefined();
  });
});

// ─── Additional Coverage ────────────────────────────────────────────────────

describe('CIUS-RO Additional Coverage', () => {
  const generator = new CIUSROGenerator();

  it('handles credit note (documentTypeCode 381)', async () => {
    const invoice = makeCIUSROInvoice({
      documentTypeCode: 381,
      precedingInvoiceReference: 'RO-2024-000',
      totals: { subtotal: -5000, taxAmount: -950, totalAmount: -5950 },
    });
    const result = await generator.generate(invoice);
    expect(result.xmlContent).toContain('381');
    expect(result.xmlContent).toBeTruthy();
  });

  it('handles non-RON currency (EUR)', async () => {
    const invoice = makeCIUSROInvoice({ currency: 'EUR' });
    const result = await generator.generate(invoice);
    expect(result.xmlContent).toContain('EUR');
  });

  it('handles missing endpoint IDs without crashing', async () => {
    const invoice = makeCIUSROInvoice({
      seller: {
        ...makeCIUSROInvoice().seller,
        electronicAddress: undefined,
        electronicAddressScheme: undefined,
      },
      buyer: {
        ...makeCIUSROInvoice().buyer,
        electronicAddress: undefined,
        electronicAddressScheme: undefined,
      },
    });
    const result = await generator.generate(invoice);
    expect(result.xmlContent).toBeTruthy();
  });
});

// ─── Factory Tests ──────────────────────────────────────────────────────────

describe('CIUS-RO Factory Registration', () => {
  it('should be available via GeneratorFactory', () => {
    const generator = GeneratorFactory.create('cius-ro');
    expect(generator.formatId).toBe('cius-ro');
  });

  it('should be listed in available formats', () => {
    const formats = GeneratorFactory.getAvailableFormats();
    expect(formats).toContain('cius-ro');
  });

  it('should have a profile validator', () => {
    const validator = getProfileValidator('cius-ro');
    expect(validator.profileId).toBe('cius-ro');
  });
});
