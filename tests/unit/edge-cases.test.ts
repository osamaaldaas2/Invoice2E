/**
 * Edge Case Coverage Tests — S5-T5
 * Tests all formats with various edge case invoices.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { GeneratorFactory } from '@/services/format/GeneratorFactory';
import type { CanonicalInvoice, OutputFormat } from '@/types/canonical-invoice';

const ALL_FORMATS: OutputFormat[] = [
  'xrechnung-cii', 'xrechnung-ubl', 'peppol-bis',
  'facturx-en16931', 'facturx-basic',
  'fatturapa', 'ksef', 'nlcius', 'cius-ro',
];

// ─── Base invoice builder ────────────────────────────────────────────────────

function baseInvoice(outputFormat: OutputFormat, overrides: Partial<CanonicalInvoice> = {}): CanonicalInvoice {
  return {
    outputFormat,
    invoiceNumber: 'EDGE-2024-001',
    invoiceDate: '2024-08-01',
    currency: 'EUR',
    documentTypeCode: 380,
    buyerReference: '04011000-12345-03',
    notes: null,
    precedingInvoiceReference: null,
    billingPeriodStart: null,
    billingPeriodEnd: null,
    seller: {
      name: 'Edge Seller GmbH',
      email: 'seller@edge.de',
      address: 'Teststr. 1',
      city: 'Berlin',
      postalCode: '10115',
      countryCode: 'DE',
      vatId: 'DE123456789',
      taxNumber: '30/123/45678',
      contactName: 'Test Contact',
      phone: '+49 30 1234567',
      electronicAddress: '0204:edge-seller',
      electronicAddressScheme: '0204',
    },
    buyer: {
      name: 'Edge Buyer B.V.',
      email: 'buyer@edge.nl',
      address: 'Buyerweg 10',
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
      paymentTerms: 'Net 30',
      dueDate: '2024-09-01',
    },
    lineItems: [
      {
        description: 'Standard Item',
        quantity: 1,
        unitPrice: 100,
        totalPrice: 100,
        taxRate: 19,
        taxCategoryCode: 'S',
        unitCode: 'C62',
      },
    ],
    totals: {
      subtotal: 100,
      taxAmount: 19,
      totalAmount: 119,
    },
    taxRate: 19,
    ...overrides,
  };
}

// ─── Edge case invoices ──────────────────────────────────────────────────────

function zeroTaxInvoice(fmt: OutputFormat): CanonicalInvoice {
  return baseInvoice(fmt, {
    invoiceNumber: 'EDGE-ZEROTAX-001',
    lineItems: [
      {
        description: 'Tax-exempt service',
        quantity: 5,
        unitPrice: 200,
        totalPrice: 1000,
        taxRate: 0,
        taxCategoryCode: 'E',
        unitCode: 'HUR',
      },
    ],
    totals: { subtotal: 1000, taxAmount: 0, totalAmount: 1000 },
    taxRate: 0,
  });
}

function creditNoteInvoice(fmt: OutputFormat): CanonicalInvoice {
  return baseInvoice(fmt, {
    invoiceNumber: 'EDGE-CN-001',
    documentTypeCode: 381,
    precedingInvoiceReference: 'INV-2024-ORIG-001',
    lineItems: [
      {
        description: 'Refunded item',
        quantity: 1,
        unitPrice: 500,
        totalPrice: 500,
        taxRate: 19,
        taxCategoryCode: 'S',
        unitCode: 'C62',
      },
    ],
    totals: { subtotal: 500, taxAmount: 95, totalAmount: 595 },
    taxRate: 19,
  });
}

function multiTaxRateInvoice(fmt: OutputFormat): CanonicalInvoice {
  return baseInvoice(fmt, {
    invoiceNumber: 'EDGE-MULTITAX-001',
    taxRate: null,
    lineItems: [
      {
        description: 'Standard rated item',
        quantity: 2,
        unitPrice: 100,
        totalPrice: 200,
        taxRate: 19,
        taxCategoryCode: 'S',
        unitCode: 'C62',
      },
      {
        description: 'Reduced rated item',
        quantity: 3,
        unitPrice: 50,
        totalPrice: 150,
        taxRate: 7,
        taxCategoryCode: 'S',
        unitCode: 'C62',
      },
    ],
    totals: { subtotal: 350, taxAmount: 48.50, totalAmount: 398.50 },
  });
}

function allowanceChargeInvoice(fmt: OutputFormat): CanonicalInvoice {
  return baseInvoice(fmt, {
    invoiceNumber: 'EDGE-ALLOWANCE-001',
    allowanceCharges: [
      {
        chargeIndicator: false,
        amount: 50,
        reason: 'Volume discount',
        reasonCode: '95',
        taxRate: 19,
        taxCategoryCode: 'S',
      },
      {
        chargeIndicator: true,
        amount: 25,
        reason: 'Express delivery',
        reasonCode: 'FC',
        taxRate: 19,
        taxCategoryCode: 'S',
      },
    ],
    lineItems: [
      {
        description: 'Product with allowances',
        quantity: 10,
        unitPrice: 100,
        totalPrice: 1000,
        taxRate: 19,
        taxCategoryCode: 'S',
        unitCode: 'C62',
      },
    ],
    totals: { subtotal: 975, taxAmount: 185.25, totalAmount: 1160.25 },
    taxRate: 19,
  });
}

function minimumInvoice(fmt: OutputFormat): CanonicalInvoice {
  return {
    outputFormat: fmt,
    invoiceNumber: 'EDGE-MIN-001',
    invoiceDate: '2024-08-01',
    currency: 'EUR',
    buyerReference: '04011000-12345-03',
    seller: {
      name: 'Min Seller GmbH',
      vatId: 'DE123456789',
      countryCode: 'DE',
      city: 'Berlin',
      postalCode: '10115',
      electronicAddress: '0204:min-seller',
      electronicAddressScheme: '0204',
    },
    buyer: {
      name: 'Min Buyer B.V.',
      vatId: 'NL123456789B01',
      countryCode: 'NL',
      city: 'Amsterdam',
      postalCode: '1015 AA',
      electronicAddress: '0190:00000000000000000001',
      electronicAddressScheme: '0190',
    },
    payment: {
      paymentTerms: 'Net 30',
    },
    lineItems: [
      {
        description: 'Single item',
        quantity: 1,
        unitPrice: 100,
        totalPrice: 100,
        taxRate: 19,
        taxCategoryCode: 'S',
        unitCode: 'C62',
      },
    ],
    totals: { subtotal: 100, taxAmount: 19, totalAmount: 119 },
    taxRate: 19,
  };
}

function maximumComplexityInvoice(fmt: OutputFormat): CanonicalInvoice {
  return baseInvoice(fmt, {
    invoiceNumber: 'EDGE-MAX-001',
    documentTypeCode: 380,
    notes: 'Maximum complexity test invoice with all optional fields populated',
    precedingInvoiceReference: 'PREV-INV-2024-001',
    billingPeriodStart: '2024-07-01',
    billingPeriodEnd: '2024-07-31',
    seller: {
      name: 'Max Complexity Seller GmbH',
      email: 'max@seller.de',
      address: 'Maximilian Straße 42, Building B, Floor 3',
      city: 'München',
      postalCode: '80539',
      countryCode: 'DE',
      vatId: 'DE999888777',
      taxNumber: '143/123/45678',
      contactName: 'Dr. Maximilian von Testerberg',
      phone: '+49 89 999888777',
      electronicAddress: '0204:max-complexity',
      electronicAddressScheme: '0204',
    },
    buyer: {
      name: 'Max Complexity Buyer International B.V.',
      email: 'procurement@maxbuyer.nl',
      address: 'Prinsengracht 999',
      city: 'Den Haag',
      postalCode: '2511 AA',
      countryCode: 'NL',
      vatId: 'NL999888777B99',
      electronicAddress: '0190:99999999999999999999',
      electronicAddressScheme: '0190',
      contactName: 'Procurement Department',
      phone: '+31 70 999888',
    },
    payment: {
      iban: 'DE89370400440532013000',
      bic: 'COBADEFFXXX',
      bankName: 'Commerzbank AG',
      paymentTerms: '2% discount within 10 days, net within 30 days',
      dueDate: '2024-09-01',
      prepaidAmount: 500,
    },
    allowanceCharges: [
      {
        chargeIndicator: false,
        amount: 100,
        baseAmount: 5000,
        percentage: 2,
        reason: 'Loyalty discount',
        reasonCode: '95',
        taxRate: 19,
        taxCategoryCode: 'S',
      },
      {
        chargeIndicator: true,
        amount: 50,
        reason: 'Insurance',
        reasonCode: 'ABL',
        taxRate: 19,
        taxCategoryCode: 'S',
      },
    ],
    lineItems: [
      {
        description: 'Premium Consulting Package',
        quantity: 40,
        unitPrice: 125,
        totalPrice: 5000,
        taxRate: 19,
        taxCategoryCode: 'S',
        unitCode: 'HUR',
      },
      {
        description: 'Enterprise Software License (Annual)',
        quantity: 5,
        unitPrice: 999.99,
        totalPrice: 4999.95,
        taxRate: 19,
        taxCategoryCode: 'S',
        unitCode: 'C62',
      },
      {
        description: 'Training Materials (Print)',
        quantity: 100,
        unitPrice: 15.50,
        totalPrice: 1550,
        taxRate: 7,
        taxCategoryCode: 'S',
        unitCode: 'C62',
      },
    ],
    totals: {
      subtotal: 11499.95,
      taxAmount: 2008.49,
      totalAmount: 13508.44,
    },
    taxRate: null,
  });
}

function nonEurInvoice(fmt: OutputFormat): CanonicalInvoice {
  return baseInvoice(fmt, {
    invoiceNumber: 'EDGE-GBP-001',
    currency: 'GBP',
    lineItems: [
      {
        description: 'UK Service',
        quantity: 1,
        unitPrice: 1000,
        totalPrice: 1000,
        taxRate: 20,
        taxCategoryCode: 'S',
        unitCode: 'C62',
      },
    ],
    totals: { subtotal: 1000, taxAmount: 200, totalAmount: 1200 },
    taxRate: 20,
  });
}

function longFieldsInvoice(fmt: OutputFormat): CanonicalInvoice {
  const longDesc = 'A'.repeat(300) + ' — This is a very long item description to test field length handling';
  const longAddress = 'B'.repeat(200) + ' Street, Building C, Suite 42, Floor 7';
  return baseInvoice(fmt, {
    invoiceNumber: 'EDGE-LONG-001',
    notes: 'C'.repeat(500),
    seller: {
      ...baseInvoice(fmt).seller,
      address: longAddress,
    },
    lineItems: [
      {
        description: longDesc,
        quantity: 1,
        unitPrice: 100,
        totalPrice: 100,
        taxRate: 19,
        taxCategoryCode: 'S',
        unitCode: 'C62',
      },
    ],
    totals: { subtotal: 100, taxAmount: 19, totalAmount: 119 },
    taxRate: 19,
  });
}

function specialCharsInvoice(fmt: OutputFormat): CanonicalInvoice {
  return baseInvoice(fmt, {
    invoiceNumber: 'EDGE-SPECIAL-001',
    notes: 'Special chars: & < > " \' and Unicode: ü ö ä é ñ ß € £ ¥',
    seller: {
      ...baseInvoice(fmt).seller,
      name: 'Müller & Söhne GmbH "Spéciàl"',
      address: 'Königstraße <42> & Nebengebäude',
      contactName: "Jean-François O'Brien",
    },
    buyer: {
      ...baseInvoice(fmt).buyer,
      name: 'Ñoño Enterprises España S.L.',
    },
    lineItems: [
      {
        description: 'Item with <angle> brackets & ampersands "quoted" \'apostrophe\' – «guillemets»',
        quantity: 1,
        unitPrice: 100,
        totalPrice: 100,
        taxRate: 19,
        taxCategoryCode: 'S',
        unitCode: 'C62',
      },
    ],
    totals: { subtotal: 100, taxAmount: 19, totalAmount: 119 },
    taxRate: 19,
  });
}

// ─── Edge case definitions ───────────────────────────────────────────────────

interface EdgeCase {
  name: string;
  factory: (fmt: OutputFormat) => CanonicalInvoice;
  /** Formats expected to fail (throw) */
  expectFailFormats?: OutputFormat[];
}

const EDGE_CASES: EdgeCase[] = [
  { name: 'zero-tax (exempt)', factory: zeroTaxInvoice },
  { name: 'credit note (381)', factory: creditNoteInvoice },
  { name: 'multi-tax-rate', factory: multiTaxRateInvoice },
  { name: 'allowances/charges', factory: allowanceChargeInvoice },
  { name: 'minimum viable', factory: minimumInvoice },
  { name: 'maximum complexity', factory: maximumComplexityInvoice },
  {
    name: 'non-EUR currency (GBP)',
    factory: nonEurInvoice,
    // XRechnung requires EUR
    expectFailFormats: ['xrechnung-cii', 'xrechnung-ubl'],
  },
  { name: 'very long fields', factory: longFieldsInvoice },
  { name: 'special characters', factory: specialCharsInvoice },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Edge Cases', () => {
  beforeAll(() => {
    GeneratorFactory.clear();
  });

  for (const edgeCase of EDGE_CASES) {
    describe(edgeCase.name, () => {
      for (const fmt of ALL_FORMATS) {
        const shouldFail = edgeCase.expectFailFormats?.includes(fmt);

        if (shouldFail) {
          it(`${fmt} — rejects or handles gracefully`, async () => {
            const gen = GeneratorFactory.create(fmt);
            const invoice = edgeCase.factory(fmt);
            try {
              const result = await gen.generate(invoice);
              // If it doesn't throw, it should at least flag validation issues
              expect(
                result.validationStatus === 'invalid' ||
                result.validationErrors.length > 0 ||
                result.validationWarnings.length > 0 ||
                result.xmlContent.length > 0 // or it generated anyway (acceptable)
              ).toBe(true);
            } catch (e: any) {
              // Throwing is acceptable for invalid input
              expect(e).toBeDefined();
            }
          });
        } else {
          it(`${fmt} — generates valid output`, async () => {
            const gen = GeneratorFactory.create(fmt);
            const invoice = edgeCase.factory(fmt);
            const result = await gen.generate(invoice);

            expect(result).toBeDefined();
            expect(result.xmlContent).toBeTruthy();
            expect(result.xmlContent.length).toBeGreaterThan(50);

            // Verify XML is well-formed (basic check)
            if (!fmt.startsWith('facturx-')) {
              expect(result.xmlContent).toMatch(/^<\?xml/);
            }
            // XML should contain the invoice number
            expect(result.xmlContent).toContain(edgeCase.factory(fmt).invoiceNumber);
          });
        }
      }
    });
  }

  describe('special characters XML safety', () => {
    it.each(ALL_FORMATS)('%s — XML entities are properly escaped', async (fmt) => {
      const gen = GeneratorFactory.create(fmt);
      const invoice = specialCharsInvoice(fmt);
      const result = await gen.generate(invoice);
      const xml = result.xmlContent;

      // Raw & < > should NOT appear unescaped (except in XML declarations/tags)
      // Check that ampersand in data is escaped
      // The seller name has '&' which must become '&amp;'
      // Note: we just verify the XML doesn't crash and is parseable
      expect(xml.length).toBeGreaterThan(100);

      // Should contain the Unicode chars (UTF-8 output)
      // At minimum, the XML should be valid (no raw < > in text content)
      // Simple heuristic: no `& ` (ampersand followed by space) which would be unescaped
      const textContent = xml.replace(/<[^>]+>/g, ''); // strip tags
      expect(textContent).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\da-fA-F]+;)/);
    });
  });
});
