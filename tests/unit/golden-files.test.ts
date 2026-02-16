/**
 * Golden File Tests — S5-T2
 * Generate reference XML for each format and compare against saved golden files.
 * Run with UPDATE_GOLDEN=1 to regenerate golden files.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { GeneratorFactory } from '@/services/format/GeneratorFactory';
import type { CanonicalInvoice, OutputFormat } from '@/types/canonical-invoice';
import * as fs from 'fs';
import * as path from 'path';

const GOLDEN_DIR = path.resolve(__dirname, '../fixtures/golden');

const ALL_FORMATS: OutputFormat[] = [
  'xrechnung-cii', 'xrechnung-ubl', 'peppol-bis',
  'facturx-en16931', 'facturx-basic',
  'fatturapa', 'ksef', 'nlcius', 'cius-ro',
];

function makeGoldenInvoice(outputFormat: OutputFormat): CanonicalInvoice {
  return {
    outputFormat,
    invoiceNumber: 'GOLDEN-2024-001',
    invoiceDate: '2024-07-15',
    currency: 'EUR',
    documentTypeCode: 380,
    buyerReference: '04011000-12345-03',
    notes: 'Golden file reference invoice',
    precedingInvoiceReference: null,
    billingPeriodStart: '2024-07-01',
    billingPeriodEnd: '2024-07-31',
    seller: {
      name: 'Golden Seller GmbH',
      email: 'seller@golden.de',
      address: 'Hauptstraße 42',
      city: 'Berlin',
      postalCode: '10115',
      countryCode: 'DE',
      vatId: 'DE123456789',
      taxNumber: '30/123/45678',
      contactName: 'Max Mustermann',
      phone: '+49 30 12345678',
      electronicAddress: '0204:golden-seller',
      electronicAddressScheme: '0204',
    },
    buyer: {
      name: 'Golden Buyer B.V.',
      email: 'buyer@golden.nl',
      address: 'Keizersgracht 200',
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
      dueDate: '2024-08-14',
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
        quantity: 2,
        unitPrice: 250,
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

/** Normalize XML for comparison: collapse whitespace, trim lines */
function normalizeXml(xml: string): string {
  return xml
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .join('\n');
}

describe('Golden File Tests', () => {
  const UPDATE = process.env.UPDATE_GOLDEN === '1';

  beforeAll(() => {
    GeneratorFactory.clear();
    if (!fs.existsSync(GOLDEN_DIR)) {
      fs.mkdirSync(GOLDEN_DIR, { recursive: true });
    }
  });

  describe.each(ALL_FORMATS)('format: %s', (formatId) => {
    it('matches golden file (or creates it)', async () => {
      const generator = GeneratorFactory.create(formatId);
      const invoice = makeGoldenInvoice(formatId);
      const result = await generator.generate(invoice);

      const goldenPath = path.join(GOLDEN_DIR, `${formatId}.xml`);

      if (UPDATE || !fs.existsSync(goldenPath)) {
        // Write golden file
        fs.writeFileSync(goldenPath, result.xmlContent, 'utf-8');
        // Also save PDF for facturx
        if (result.pdfContent) {
          fs.writeFileSync(path.join(GOLDEN_DIR, `${formatId}.pdf`), result.pdfContent);
        }
        console.log(`[golden] Wrote ${goldenPath}`);
      }

      const golden = fs.readFileSync(goldenPath, 'utf-8');
      expect(normalizeXml(result.xmlContent)).toBe(normalizeXml(golden));
    });
  });
});
