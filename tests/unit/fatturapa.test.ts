/**
 * FatturaPA — comprehensive unit tests.
 * Covers: generator output (XML), validation rules, factory registration.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GeneratorFactory } from '@/services/format/GeneratorFactory';
import { FatturapaGenerator } from '@/services/format/fatturapa/fatturapa.generator';
import { getProfileValidator, getAvailableProfiles } from '@/validation/ProfileValidatorFactory';
import { validateFatturapaRules } from '@/validation/fatturapa-rules';
import type { CanonicalInvoice } from '@/types/canonical-invoice';

// ─── Test Helper ─────────────────────────────────────────────────────────────

/** Create a valid FatturaPA CanonicalInvoice for testing. */
function makeFatturapaInvoice(overrides?: Partial<CanonicalInvoice>): CanonicalInvoice {
  return {
    outputFormat: 'fatturapa',
    invoiceNumber: 'FPA-2024-001',
    invoiceDate: '2024-07-01',
    currency: 'EUR',
    documentTypeCode: 380,
    buyerReference: 'PO-2024-42',
    notes: 'FatturaPA test invoice',
    seller: {
      name: 'Azienda Italiana SRL',
      email: 'fattura@azienda.it',
      address: 'Via Roma 10',
      city: 'Milano',
      postalCode: '20121',
      countryCode: 'IT',
      vatId: 'IT01234567890',
      taxNumber: 'RSSMRA80A01H501U',
      contactName: 'Mario Rossi',
      phone: '+39 02 1234567',
    },
    buyer: {
      name: 'Società Acquirente SPA',
      email: 'acquisti@societa.it',
      address: 'Corso Italia 5',
      city: 'Roma',
      postalCode: '00185',
      countryCode: 'IT',
      vatId: 'IT09876543210',
      electronicAddress: 'ABC1234',
    },
    payment: {
      iban: 'IT60X0542811101000000123456',
      bic: 'BPPIITRRXXX',
      paymentTerms: 'Net 30 days',
      dueDate: '2024-07-31',
    },
    lineItems: [
      {
        description: 'Servizi di consulenza',
        quantity: 10,
        unitPrice: 150,
        totalPrice: 1500,
        taxRate: 22,
        taxCategoryCode: 'S',
        unitCode: 'HUR',
      },
      {
        description: 'Licenza software',
        quantity: 1,
        unitPrice: 500,
        totalPrice: 500,
        taxRate: 22,
        taxCategoryCode: 'S',
        unitCode: 'C62',
      },
    ],
    totals: {
      subtotal: 2000,
      taxAmount: 440,
      totalAmount: 2440,
    },
    taxRate: 22,
    ...overrides,
  };
}

// ─── Generator Tests ─────────────────────────────────────────────────────────

describe('FatturaPA Generator', () => {
  let generator: FatturapaGenerator;

  beforeEach(() => {
    generator = new FatturapaGenerator();
  });

  it('generates valid FatturaPA XML', async () => {
    const invoice = makeFatturapaInvoice();
    const result = await generator.generate(invoice);
    expect(result.xmlContent).toBeTruthy();
    expect(result.validationStatus).toBe('valid');
    expect(result.validationErrors).toHaveLength(0);
  });

  it('has correct root element FatturaElettronica with namespace', async () => {
    const invoice = makeFatturapaInvoice();
    const result = await generator.generate(invoice);
    expect(result.xmlContent).toContain('FatturaElettronica');
    expect(result.xmlContent).toContain('xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2"');
  });

  it('has versione="FPR12" for B2B', async () => {
    const invoice = makeFatturapaInvoice();
    const result = await generator.generate(invoice);
    expect(result.xmlContent).toContain('versione="FPR12"');
  });

  it('contains CedentePrestatore (seller) with correct data', async () => {
    const invoice = makeFatturapaInvoice();
    const result = await generator.generate(invoice);
    const xml = result.xmlContent;
    expect(xml).toContain('<CedentePrestatore>');
    expect(xml).toContain('<Denominazione>Azienda Italiana SRL</Denominazione>');
    expect(xml).toContain('<Indirizzo>Via Roma 10</Indirizzo>');
    expect(xml).toContain('<Comune>Milano</Comune>');
    expect(xml).toContain('<CAP>20121</CAP>');
  });

  it('contains CessionarioCommittente (buyer)', async () => {
    const invoice = makeFatturapaInvoice();
    const result = await generator.generate(invoice);
    const xml = result.xmlContent;
    expect(xml).toContain('<CessionarioCommittente>');
    expect(xml).toContain('<Denominazione>Società Acquirente SPA</Denominazione>');
  });

  it('contains DettaglioLinee for each line item', async () => {
    const invoice = makeFatturapaInvoice();
    const result = await generator.generate(invoice);
    const xml = result.xmlContent;
    const matches = xml.match(/<DettaglioLinee>/g);
    expect(matches).toHaveLength(2);
    expect(xml).toContain('<Descrizione>Servizi di consulenza</Descrizione>');
    expect(xml).toContain('<Descrizione>Licenza software</Descrizione>');
    expect(xml).toContain('<NumeroLinea>1</NumeroLinea>');
    expect(xml).toContain('<NumeroLinea>2</NumeroLinea>');
  });

  it('contains DatiRiepilogo tax summary', async () => {
    const invoice = makeFatturapaInvoice();
    const result = await generator.generate(invoice);
    expect(result.xmlContent).toContain('<DatiRiepilogo>');
    expect(result.xmlContent).toContain('<AliquotaIVA>22.00</AliquotaIVA>');
  });

  it('maps invoice (380) → TD01, credit note (381) → TD04', async () => {
    const invoice380 = makeFatturapaInvoice({ documentTypeCode: 380 });
    const result380 = await generator.generate(invoice380);
    expect(result380.xmlContent).toContain('<TipoDocumento>TD01</TipoDocumento>');

    const invoice381 = makeFatturapaInvoice({ documentTypeCode: 381 });
    const result381 = await generator.generate(invoice381);
    expect(result381.xmlContent).toContain('<TipoDocumento>TD04</TipoDocumento>');
  });

  it('handles payment info with IBAN', async () => {
    const invoice = makeFatturapaInvoice();
    const result = await generator.generate(invoice);
    const xml = result.xmlContent;
    expect(xml).toContain('<DatiPagamento>');
    expect(xml).toContain('<IBAN>IT60X0542811101000000123456</IBAN>');
    expect(xml).toContain('<ModalitaPagamento>MP05</ModalitaPagamento>');
  });

  it('splits VAT ID into IdPaese + IdCodice correctly', async () => {
    const invoice = makeFatturapaInvoice();
    const result = await generator.generate(invoice);
    const xml = result.xmlContent;
    expect(xml).toContain('<IdPaese>IT</IdPaese>');
    expect(xml).toContain('<IdCodice>01234567890</IdCodice>');
  });
});

// ─── Validation Tests ────────────────────────────────────────────────────────

describe('FatturaPA Validation Rules', () => {
  it('valid FatturaPA invoice passes with no errors', () => {
    const invoice = makeFatturapaInvoice();
    const errors = validateFatturapaRules(invoice);
    const actual = errors.filter((e) => e.level === 'error');
    expect(actual).toHaveLength(0);
  });

  it('missing seller VAT ID fails', () => {
    const invoice = makeFatturapaInvoice({
      seller: { ...makeFatturapaInvoice().seller, vatId: null },
    });
    const errors = validateFatturapaRules(invoice);
    expect(errors.some((e) => e.ruleId === 'FPA-010')).toBe(true);
  });

  it('missing seller address fails', () => {
    const invoice = makeFatturapaInvoice({
      seller: { ...makeFatturapaInvoice().seller, address: null },
    });
    const errors = validateFatturapaRules(invoice);
    expect(errors.some((e) => e.ruleId === 'FPA-011')).toBe(true);
  });

  it('missing seller city fails', () => {
    const invoice = makeFatturapaInvoice({
      seller: { ...makeFatturapaInvoice().seller, city: null },
    });
    const errors = validateFatturapaRules(invoice);
    expect(errors.some((e) => e.ruleId === 'FPA-012')).toBe(true);
  });

  it('missing seller postal code fails', () => {
    const invoice = makeFatturapaInvoice({
      seller: { ...makeFatturapaInvoice().seller, postalCode: null },
    });
    const errors = validateFatturapaRules(invoice);
    expect(errors.some((e) => e.ruleId === 'FPA-013')).toBe(true);
  });

  it('missing buyer identification fails', () => {
    const invoice = makeFatturapaInvoice({
      buyer: { ...makeFatturapaInvoice().buyer, vatId: null, taxNumber: null, taxId: null },
    });
    const errors = validateFatturapaRules(invoice);
    expect(errors.some((e) => e.ruleId === 'FPA-020')).toBe(true);
  });

  it('missing line items fails', () => {
    const invoice = makeFatturapaInvoice({ lineItems: [] });
    const errors = validateFatturapaRules(invoice);
    expect(errors.some((e) => e.ruleId === 'FPA-030')).toBe(true);
  });

  it('missing invoice number fails', () => {
    const invoice = makeFatturapaInvoice({ invoiceNumber: '' });
    const errors = validateFatturapaRules(invoice);
    expect(errors.some((e) => e.ruleId === 'FPA-001')).toBe(true);
  });

  it('missing currency fails', () => {
    const invoice = makeFatturapaInvoice({ currency: '' });
    const errors = validateFatturapaRules(invoice);
    expect(errors.some((e) => e.ruleId === 'FPA-003')).toBe(true);
  });

  it('line item missing description fails', () => {
    const invoice = makeFatturapaInvoice({
      lineItems: [{ description: '', quantity: 1, unitPrice: 100, totalPrice: 100, taxRate: 22 }],
    });
    const errors = validateFatturapaRules(invoice);
    expect(errors.some((e) => e.ruleId === 'FPA-031')).toBe(true);
  });

  it('line item missing tax rate fails', () => {
    const invoice = makeFatturapaInvoice({
      lineItems: [{ description: 'Test', quantity: 1, unitPrice: 100, totalPrice: 100 }],
    });
    const errors = validateFatturapaRules(invoice);
    expect(errors.some((e) => e.ruleId === 'FPA-034')).toBe(true);
  });
});

// ─── Additional Coverage ─────────────────────────────────────────────────────

describe('FatturaPA Additional Coverage', () => {
  let generator: FatturapaGenerator;

  beforeEach(() => {
    generator = new FatturapaGenerator();
  });

  it('generates credit note with TD04', async () => {
    const invoice = makeFatturapaInvoice({
      documentTypeCode: 381,
      precedingInvoiceReference: 'FPA-2024-000',
      totals: { subtotal: -2000, taxAmount: -440, totalAmount: -2440 },
    });
    const result = await generator.generate(invoice);
    expect(result.xmlContent).toContain('<TipoDocumento>TD04</TipoDocumento>');
    expect(result.validationStatus).toBe('valid');
  });

  it('handles special characters in description (XML escaping)', async () => {
    const invoice = makeFatturapaInvoice({
      lineItems: [
        {
          description: 'Test <item> with "quotes" & ampersand',
          quantity: 1,
          unitPrice: 100,
          totalPrice: 100,
          taxRate: 22,
          taxCategoryCode: 'S',
          unitCode: 'C62',
        },
      ],
      totals: { subtotal: 100, taxAmount: 22, totalAmount: 122 },
    });
    const result = await generator.generate(invoice);
    // XML must be well-formed — should not contain raw < or & in content
    expect(result.xmlContent).not.toContain('<item>');
    expect(result.xmlContent).toContain('&amp;');
  });

  it('handles allowance/charges without crashing', async () => {
    const invoice = makeFatturapaInvoice({
      allowanceCharges: [
        {
          chargeIndicator: false,
          amount: 100,
          reason: 'Discount',
          taxRate: 22,
          taxCategoryCode: 'S',
        },
      ],
      totals: { subtotal: 1900, taxAmount: 418, totalAmount: 2318 },
    });
    const result = await generator.generate(invoice);
    expect(result.xmlContent).toBeTruthy();
  });
});

// ─── Factory Tests ───────────────────────────────────────────────────────────

describe('FatturaPA Factory Integration', () => {
  beforeEach(() => {
    GeneratorFactory.clear();
  });

  it('GeneratorFactory.create("fatturapa") works', () => {
    const generator = GeneratorFactory.create('fatturapa');
    expect(generator).toBeInstanceOf(FatturapaGenerator);
    expect(generator.formatId).toBe('fatturapa');
  });

  it('ProfileValidatorFactory returns FatturaPA validator', () => {
    const validator = getProfileValidator('fatturapa');
    expect(validator.profileId).toBe('fatturapa');
    expect(validator.profileName).toBe('FatturaPA');
  });

  it('"fatturapa" is in available formats', () => {
    const formats = GeneratorFactory.getAvailableFormats();
    expect(formats).toContain('fatturapa');
  });

  it('"fatturapa" is in available profiles', () => {
    const profiles = getAvailableProfiles();
    expect(profiles).toContain('fatturapa');
  });
});
