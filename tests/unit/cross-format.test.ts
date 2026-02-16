/**
 * Cross-Format Integration Tests.
 * Verifies that a single CanonicalInvoice can be generated in ALL formats.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GeneratorFactory } from '@/services/format/GeneratorFactory';
import type { CanonicalInvoice, OutputFormat } from '@/types/canonical-invoice';

// ─── Full Invoice Fixture ────────────────────────────────────────────────────

function makeFullInvoice(outputFormat: OutputFormat): CanonicalInvoice {
  return {
    outputFormat,
    invoiceNumber: 'CROSS-2024-001',
    invoiceDate: '2024-07-01',
    currency: 'EUR',
    documentTypeCode: 380,
    buyerReference: '04011000-12345-03',
    notes: 'Cross-format integration test invoice',
    precedingInvoiceReference: null,
    billingPeriodStart: '2024-06-01',
    billingPeriodEnd: '2024-06-30',
    seller: {
      name: 'Test Seller GmbH',
      email: 'seller@test.de',
      address: 'Hauptstraße 1',
      city: 'Berlin',
      postalCode: '10115',
      countryCode: 'DE',
      vatId: 'DE123456789',
      taxNumber: '30/123/45678',
      contactName: 'Max Mustermann',
      phone: '+49 30 12345678',
      electronicAddress: '0204:test-seller',
      electronicAddressScheme: '0204',
    },
    buyer: {
      name: 'Test Buyer B.V.',
      email: 'buyer@test.nl',
      address: 'Keizersgracht 100',
      city: 'Amsterdam',
      postalCode: '1015 AA',
      countryCode: 'NL',
      vatId: 'NL123456789B01',
      electronicAddress: '0190:00000000000000000001',
      electronicAddressScheme: '0190',
    },
    payment: {
      iban: 'DE89370400440532013000',
      bic: 'COBADEFFXXX',
      paymentTerms: 'Net 30 days',
      dueDate: '2024-07-31',
    },
    lineItems: [
      {
        description: 'Consulting Services',
        quantity: 10,
        unitPrice: 150,
        totalPrice: 1500,
        taxRate: 19,
        taxCategoryCode: 'S',
        unitCode: 'HUR',
      },
      {
        description: 'Software License',
        quantity: 1,
        unitPrice: 500,
        totalPrice: 500,
        taxRate: 19,
        taxCategoryCode: 'S',
        unitCode: 'C62',
      },
    ],
    totals: {
      subtotal: 2000,
      taxAmount: 380,
      totalAmount: 2380,
    },
    taxRate: 19,
  };
}

const ALL_FORMATS: OutputFormat[] = [
  'xrechnung-cii',
  'xrechnung-ubl',
  'peppol-bis',
  'facturx-en16931',
  'facturx-basic',
  'fatturapa',
  'ksef',
  'nlcius',
  'cius-ro',
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Cross-Format Integration', () => {
  beforeEach(() => {
    GeneratorFactory.clear();
  });

  describe.each(ALL_FORMATS)('format: %s', (formatId) => {
    it('generates without throwing', async () => {
      const generator = GeneratorFactory.create(formatId);
      const invoice = makeFullInvoice(formatId);
      const result = await generator.generate(invoice);
      expect(result).toBeDefined();
    });

    it('returns non-empty content', async () => {
      const generator = GeneratorFactory.create(formatId);
      const invoice = makeFullInvoice(formatId);
      const result = await generator.generate(invoice);

      if (formatId.startsWith('facturx-')) {
        // Factur-X returns PDF
        expect(result.pdfContent).toBeDefined();
        expect(result.pdfContent).toBeInstanceOf(Buffer);
        expect(result.pdfContent!.length).toBeGreaterThan(0);
      }

      // All formats should produce xmlContent
      expect(result.xmlContent).toBeTruthy();
      expect(result.xmlContent.length).toBeGreaterThan(0);
    });
  });

  it('Factur-X formats return pdfContent (Buffer)', async () => {
    for (const fmt of ['facturx-en16931', 'facturx-basic'] as OutputFormat[]) {
      const gen = GeneratorFactory.create(fmt);
      const result = await gen.generate(makeFullInvoice(fmt));
      expect(result.pdfContent).toBeInstanceOf(Buffer);
      expect(result.pdfContent!.length).toBeGreaterThan(100);
    }
  });

  it('format switching: generate same invoice in format A then format B', async () => {
    const genA = GeneratorFactory.create('xrechnung-cii');
    const genB = GeneratorFactory.create('fatturapa');

    const resultA = await genA.generate(makeFullInvoice('xrechnung-cii'));
    const resultB = await genB.generate(makeFullInvoice('fatturapa'));

    expect(resultA.xmlContent).toBeTruthy();
    expect(resultB.xmlContent).toBeTruthy();
    // Different formats should produce different XML
    expect(resultA.xmlContent).not.toBe(resultB.xmlContent);
  });

  it('GeneratorFactory.create throws for unknown format', () => {
    expect(() => {
      GeneratorFactory.create('nonexistent' as OutputFormat);
    }).toThrow(/[Uu]nknown/);
  });

  it('GeneratorFactory.create throws for invalid-format', () => {
    expect(() => {
      GeneratorFactory.create('invalid-format' as OutputFormat);
    }).toThrow();
  });
});
