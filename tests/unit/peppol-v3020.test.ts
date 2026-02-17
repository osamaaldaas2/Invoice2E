/**
 * Peppol BIS Billing 3.0 — v3.0.20 compliance smoke-tests.
 *
 * Verifies:
 *  1. Generator declares specVersion = '3.0.20' and specDate = '2024-10-09'
 *  2. Generated XML contains the canonical CustomizationID and ProfileID
 *  3. VALID_ENDPOINT_SCHEME_IDS includes newly added codes 0217-0221
 *  4. validatePeppolRules rejects unknown EAS scheme codes
 *  5. validatePeppolRules accepts codes 0217-0221 (added in 3.0.18+)
 *  6. All generators implement the specVersion / specDate fields
 */

import { describe, it, expect } from 'vitest';
import { PeppolBISGenerator } from '@/services/format/peppol/peppol-bis.generator';
import { validatePeppolRules } from '@/validation/peppol-rules';
import { GeneratorFactory } from '@/services/format/GeneratorFactory';
import type { CanonicalInvoice } from '@/types/canonical-invoice';

// ── Minimal canonical invoice fixture ────────────────────────────────────────

const MINIMAL_PEPPOL_INVOICE: CanonicalInvoice = {
  invoiceNumber: 'TEST-PEPPOL-3020',
  invoiceDate: '2026-02-17',
  documentTypeCode: 380,
  outputFormat: 'peppol-bis' as const,
  currency: 'EUR',
  seller: {
    name: 'Test Seller GmbH',
    vatId: 'DE123456789',
    address: 'Teststraße 1',
    city: 'Berlin',
    postalCode: '10115',
    countryCode: 'DE',
    electronicAddress: 'test@seller.de',
    electronicAddressScheme: '0088',
  },
  buyer: {
    name: 'Test Buyer Ltd',
    address: '1 Test Street',
    city: 'London',
    postalCode: 'EC1A 1BB',
    countryCode: 'GB',
    electronicAddress: '0192:987654321',
    electronicAddressScheme: '0192',
  },
  lineItems: [
    {
      description: 'Consulting services',
      quantity: 1,
      unitCode: 'HUR',
      unitPrice: 100,
      totalPrice: 100,
      taxRate: 19,
      taxCategoryCode: 'S',
    },
  ],
  totals: {
    subtotal: 100,
    taxAmount: 19,
    totalAmount: 119,
  },
  payment: {
    paymentTerms: '30 Tage netto',
  },
};

// ── Test suite ────────────────────────────────────────────────────────────────

describe('Peppol BIS Billing 3.0 v3.0.20 compliance', () => {
  const generator = new PeppolBISGenerator();

  // ── 1. Generator metadata ─────────────────────────────────────────────────
  describe('Generator spec metadata', () => {
    it('declares specVersion = "3.0.20"', () => {
      expect(generator.specVersion).toBe('3.0.20');
    });

    it('declares specDate = "2024-10-09"', () => {
      expect(generator.specDate).toBe('2024-10-09');
    });

    it('formatId = "peppol-bis"', () => {
      expect(generator.formatId).toBe('peppol-bis');
    });
  });

  // ── 2. Generated XML identifiers ──────────────────────────────────────────
  describe('Generated XML — canonical identifiers', () => {
    it('contains the PEPPOL BIS 3.0 CustomizationID', async () => {
      const result = await generator.generate(MINIMAL_PEPPOL_INVOICE);
      expect(result.xmlContent).toContain(
        'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0'
      );
    });

    it('contains the PEPPOL BIS 3.0 ProfileID', async () => {
      const result = await generator.generate(MINIMAL_PEPPOL_INVOICE);
      expect(result.xmlContent).toContain('urn:fdc:peppol.eu:2017:poacc:billing:01:1.0');
    });

    it('contains EndpointID for seller (BT-34)', async () => {
      const result = await generator.generate(MINIMAL_PEPPOL_INVOICE);
      expect(result.xmlContent).toContain('EndpointID');
    });
  });

  // ── 3. EAS code list — new codes 0217-0221 ────────────────────────────────
  describe('EAS code list — v3.0.20 additions', () => {
    const newCodes = ['0217', '0218', '0219', '0220', '0221'];

    for (const code of newCodes) {
      it(`accepts EAS scheme code ${code} (added in 3.0.18+)`, () => {
        const invoice: CanonicalInvoice = {
          ...MINIMAL_PEPPOL_INVOICE,
          seller: { ...MINIMAL_PEPPOL_INVOICE.seller, electronicAddressScheme: code },
          buyer: { ...MINIMAL_PEPPOL_INVOICE.buyer, electronicAddressScheme: code },
        };
        const errors = validatePeppolRules(invoice);
        const schemeErrors = errors.filter((e) => e.ruleId.includes('SCHEME'));
        expect(schemeErrors).toHaveLength(0);
      });
    }

    it('rejects an unknown EAS scheme code', () => {
      const invoice: CanonicalInvoice = {
        ...MINIMAL_PEPPOL_INVOICE,
        seller: { ...MINIMAL_PEPPOL_INVOICE.seller, electronicAddressScheme: '9999' },
      };
      const errors = validatePeppolRules(invoice);
      const schemeErrors = errors.filter((e) => e.ruleId.includes('SCHEME'));
      expect(schemeErrors.length).toBeGreaterThan(0);
    });
  });

  // ── 4. Mandatory fields rejection ────────────────────────────────────────
  describe('Mandatory field validation', () => {
    it('rejects invoice missing buyer electronicAddress (BT-49)', () => {
      const invoice: CanonicalInvoice = {
        ...MINIMAL_PEPPOL_INVOICE,
        buyer: { ...MINIMAL_PEPPOL_INVOICE.buyer, electronicAddress: undefined },
      };
      const errors = validatePeppolRules(invoice);
      expect(errors.some((e) => e.ruleId === 'PEPPOL-EN16931-R010')).toBe(true);
    });

    it('rejects invoice missing seller electronicAddress (BT-34)', () => {
      const invoice: CanonicalInvoice = {
        ...MINIMAL_PEPPOL_INVOICE,
        seller: { ...MINIMAL_PEPPOL_INVOICE.seller, electronicAddress: undefined },
      };
      const errors = validatePeppolRules(invoice);
      expect(errors.some((e) => e.ruleId === 'PEPPOL-EN16931-R020')).toBe(true);
    });
  });

  // ── 5. All generators implement specVersion / specDate ───────────────────
  describe('All generators implement specVersion and specDate', () => {
    const formatIds = [
      'xrechnung-cii',
      'xrechnung-ubl',
      'peppol-bis',
      'facturx-en16931',
      'facturx-basic',
      'fatturapa',
      'ksef',
      'nlcius',
      'cius-ro',
    ] as const;

    for (const formatId of formatIds) {
      it(`${formatId} has a non-empty specVersion and specDate`, () => {
        const gen = GeneratorFactory.create(formatId);
        expect(gen.specVersion).toBeTruthy();
        expect(gen.specDate).toBeTruthy();
        // specDate must be a valid ISO date (YYYY-MM-DD)
        expect(gen.specDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
    }
  });
});
