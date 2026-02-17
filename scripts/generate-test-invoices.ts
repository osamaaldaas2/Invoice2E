/**
 * Generate test invoices for all supported e-invoice formats.
 * Used by Schematron validation CI to produce XML files for validation.
 *
 * Usage: npx tsx scripts/generate-test-invoices.ts
 * Output: tmp/test-invoices/<format>.xml
 *
 * @module scripts/generate-test-invoices
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { GeneratorFactory } from '@/services/format/GeneratorFactory';
import type { CanonicalInvoice, OutputFormat } from '@/types/canonical-invoice';

const OUTPUT_DIR = path.resolve(__dirname, '..', 'tmp', 'test-invoices');

/**
 * Build a minimal but valid canonical invoice for a given format.
 * Populates all mandatory EN 16931 fields so each generator produces spec-compliant XML.
 */
function buildTestInvoice(format: OutputFormat): CanonicalInvoice {
  return {
    outputFormat: format,
    invoiceNumber: `TEST-${format.toUpperCase()}-001`,
    invoiceDate: '2026-02-17',
    documentTypeCode: '380',
    currency: 'EUR',
    buyerReference: 'BUYER-REF-001',
    notes: 'Schematron CI test invoice',
    seller: {
      name: 'Test Seller GmbH',
      address: 'Musterstraße 1',
      city: 'Berlin',
      postalCode: '10115',
      countryCode: 'DE',
      vatId: 'DE123456789',
      email: 'seller@example.com',
      electronicAddress: 'seller@example.com',
      electronicAddressScheme: 'EM',
      contactName: 'Max Mustermann',
      taxRegime: 'RF01',
    },
    buyer: {
      name: 'Test Buyer B.V.',
      address: 'Keizersgracht 100',
      city: 'Amsterdam',
      postalCode: '1015 AA',
      countryCode: 'NL',
      vatId: 'NL123456789B01',
      email: 'buyer@example.com',
      electronicAddress: 'buyer@example.com',
      electronicAddressScheme: 'EM',
    },
    payment: {
      iban: 'DE89370400440532013000',
      bic: 'COBADEFFXXX',
      bankName: 'Commerzbank',
      paymentTerms: 'Net 30 days',
      dueDate: '2026-03-19',
    },
    lineItems: [
      {
        description: 'Consulting Services',
        quantity: 10,
        unitPrice: 100.0,
        totalPrice: 1000.0,
        taxRate: 19,
        taxCategoryCode: 'S',
        unitCode: 'HUR',
      },
      {
        description: 'Software License',
        quantity: 1,
        unitPrice: 500.0,
        totalPrice: 500.0,
        taxRate: 19,
        taxCategoryCode: 'S',
        unitCode: 'C62',
      },
    ],
    totals: {
      subtotal: 1500.0,
      taxAmount: 285.0,
      totalAmount: 1785.0,
    },
    taxRate: 19,
  };
}

async function main(): Promise<void> {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const formats = GeneratorFactory.getAvailableFormats();
  const results: Array<{ format: string; success: boolean; error?: string }> = [];

  for (const format of formats) {
    try {
      const generator = GeneratorFactory.create(format);
      const invoice = buildTestInvoice(format);
      const result = await generator.generate(invoice);

      const outputFile = path.join(OUTPUT_DIR, `${format}.xml`);
      fs.writeFileSync(outputFile, result.xmlContent, 'utf-8');

      results.push({ format, success: true });
      console.log(`✅ ${format} → ${outputFile} (${result.fileSize} bytes)`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ format, success: false, error: message });
      console.error(`❌ ${format} → ${message}`);
    }
  }

  // Write summary JSON for downstream validation script
  const summaryPath = path.join(OUTPUT_DIR, 'generation-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2), 'utf-8');

  const failed = results.filter((r) => !r.success);
  if (failed.length > 0) {
    console.error(`\n${failed.length}/${formats.length} formats failed generation.`);
    process.exit(1);
  }

  console.log(`\n✅ All ${formats.length} formats generated successfully.`);
}

main();
