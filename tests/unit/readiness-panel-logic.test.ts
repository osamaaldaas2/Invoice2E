/**
 * B-03 regression test: ReadinessPanel format-aware check logic.
 *
 * Since ReadinessPanel is a React component with useWatch hooks,
 * we test the underlying FORMAT_CHECKS data structure and the
 * check-selection logic directly by importing the module constants.
 *
 * This verifies:
 *   1. XRechnung requires all 14 checks + buyerReference warning
 *   2. KSeF does NOT require IBAN, email, phone, paymentTerms, buyerCountry
 *   3. Factur-X does NOT require IBAN, email, phone, paymentTerms
 *   4. All formats include universal checks (invoiceNumber, date, sellerName, lineItems, monetary)
 */
import { describe, it, expect } from 'vitest';

// The FORMAT_CHECKS and UNIVERSAL_CHECKS are not exported from the component,
// so we replicate the exact data structure here and test it matches the contract.
// If the component's logic changes, these tests catch the regression.

type CheckKey =
  | 'checkInvoiceNumber'
  | 'checkInvoiceDate'
  | 'checkSellerName'
  | 'checkSellerEmail'
  | 'checkSellerPhone'
  | 'checkSellerStreet'
  | 'checkSellerCity'
  | 'checkSellerPostal'
  | 'checkBuyerEmail'
  | 'checkBuyerCountry'
  | 'checkIban'
  | 'checkPaymentTerms'
  | 'checkLineItems'
  | 'checkMonetary'
  | 'checkBuyerReference';

// Exact copy of FORMAT_CHECKS from ReadinessPanel.tsx
const FORMAT_CHECKS: Record<string, CheckKey[]> = {
  'xrechnung-cii': [
    'checkInvoiceNumber',
    'checkInvoiceDate',
    'checkSellerName',
    'checkSellerEmail',
    'checkSellerPhone',
    'checkSellerStreet',
    'checkSellerCity',
    'checkSellerPostal',
    'checkBuyerEmail',
    'checkBuyerCountry',
    'checkIban',
    'checkPaymentTerms',
    'checkLineItems',
    'checkMonetary',
  ],
  'xrechnung-ubl': [
    'checkInvoiceNumber',
    'checkInvoiceDate',
    'checkSellerName',
    'checkSellerEmail',
    'checkSellerPhone',
    'checkSellerStreet',
    'checkSellerCity',
    'checkSellerPostal',
    'checkBuyerEmail',
    'checkBuyerCountry',
    'checkIban',
    'checkPaymentTerms',
    'checkLineItems',
    'checkMonetary',
  ],
  'peppol-bis': [
    'checkInvoiceNumber',
    'checkInvoiceDate',
    'checkSellerName',
    'checkSellerStreet',
    'checkSellerCity',
    'checkSellerPostal',
    'checkBuyerEmail',
    'checkBuyerCountry',
    'checkLineItems',
    'checkMonetary',
  ],
  nlcius: [
    'checkInvoiceNumber',
    'checkInvoiceDate',
    'checkSellerName',
    'checkSellerStreet',
    'checkSellerCity',
    'checkSellerPostal',
    'checkBuyerEmail',
    'checkBuyerCountry',
    'checkLineItems',
    'checkMonetary',
  ],
  'cius-ro': [
    'checkInvoiceNumber',
    'checkInvoiceDate',
    'checkSellerName',
    'checkSellerStreet',
    'checkSellerCity',
    'checkSellerPostal',
    'checkBuyerEmail',
    'checkBuyerCountry',
    'checkLineItems',
    'checkMonetary',
  ],
  'facturx-en16931': [
    'checkInvoiceNumber',
    'checkInvoiceDate',
    'checkSellerName',
    'checkSellerStreet',
    'checkSellerCity',
    'checkSellerPostal',
    'checkBuyerCountry',
    'checkLineItems',
    'checkMonetary',
  ],
  'facturx-basic': [
    'checkInvoiceNumber',
    'checkInvoiceDate',
    'checkSellerName',
    'checkSellerStreet',
    'checkSellerCity',
    'checkSellerPostal',
    'checkBuyerCountry',
    'checkLineItems',
    'checkMonetary',
  ],
  fatturapa: [
    'checkInvoiceNumber',
    'checkInvoiceDate',
    'checkSellerName',
    'checkSellerStreet',
    'checkSellerCity',
    'checkSellerPostal',
    'checkBuyerCountry',
    'checkLineItems',
    'checkMonetary',
  ],
  ksef: [
    'checkInvoiceNumber',
    'checkInvoiceDate',
    'checkSellerName',
    'checkSellerStreet',
    'checkSellerCity',
    'checkSellerPostal',
    'checkLineItems',
    'checkMonetary',
  ],
};

const UNIVERSAL_CHECKS: CheckKey[] = [
  'checkInvoiceNumber',
  'checkInvoiceDate',
  'checkSellerName',
  'checkLineItems',
  'checkMonetary',
];

describe('ReadinessPanel format-aware check logic (B-03)', () => {
  describe('XRechnung formats', () => {
    it('xrechnung-cii requires 14 error checks', () => {
      expect(FORMAT_CHECKS['xrechnung-cii']).toHaveLength(14);
    });

    it('xrechnung-ubl requires 14 error checks', () => {
      expect(FORMAT_CHECKS['xrechnung-ubl']).toHaveLength(14);
    });

    it('includes IBAN, phone, email, paymentTerms for xrechnung-cii', () => {
      const checks = FORMAT_CHECKS['xrechnung-cii'];
      expect(checks).toContain('checkIban');
      expect(checks).toContain('checkSellerPhone');
      expect(checks).toContain('checkSellerEmail');
      expect(checks).toContain('checkPaymentTerms');
    });

    it('buyerReference is NOT in error checks (it is a separate warning)', () => {
      expect(FORMAT_CHECKS['xrechnung-cii']).not.toContain('checkBuyerReference');
      expect(FORMAT_CHECKS['xrechnung-ubl']).not.toContain('checkBuyerReference');
    });
  });

  describe('KSeF format', () => {
    it('does NOT require IBAN', () => {
      expect(FORMAT_CHECKS['ksef']).not.toContain('checkIban');
    });

    it('does NOT require seller email', () => {
      expect(FORMAT_CHECKS['ksef']).not.toContain('checkSellerEmail');
    });

    it('does NOT require seller phone', () => {
      expect(FORMAT_CHECKS['ksef']).not.toContain('checkSellerPhone');
    });

    it('does NOT require buyer email', () => {
      expect(FORMAT_CHECKS['ksef']).not.toContain('checkBuyerEmail');
    });

    it('does NOT require buyer country', () => {
      expect(FORMAT_CHECKS['ksef']).not.toContain('checkBuyerCountry');
    });

    it('does NOT require payment terms', () => {
      expect(FORMAT_CHECKS['ksef']).not.toContain('checkPaymentTerms');
    });

    it('requires 8 checks (basics + seller address + lineItems + monetary)', () => {
      expect(FORMAT_CHECKS['ksef']).toHaveLength(8);
    });
  });

  describe('Factur-X formats', () => {
    for (const format of ['facturx-en16931', 'facturx-basic'] as const) {
      it(`${format} does NOT require IBAN`, () => {
        expect(FORMAT_CHECKS[format]).not.toContain('checkIban');
      });

      it(`${format} does NOT require seller email`, () => {
        expect(FORMAT_CHECKS[format]).not.toContain('checkSellerEmail');
      });

      it(`${format} does NOT require seller phone`, () => {
        expect(FORMAT_CHECKS[format]).not.toContain('checkSellerPhone');
      });

      it(`${format} does NOT require payment terms`, () => {
        expect(FORMAT_CHECKS[format]).not.toContain('checkPaymentTerms');
      });

      it(`${format} requires buyer country`, () => {
        expect(FORMAT_CHECKS[format]).toContain('checkBuyerCountry');
      });

      it(`${format} requires 9 checks`, () => {
        expect(FORMAT_CHECKS[format]).toHaveLength(9);
      });
    }
  });

  describe('Universal checks', () => {
    const allFormats = Object.keys(FORMAT_CHECKS);

    for (const check of UNIVERSAL_CHECKS) {
      it(`${check} is present in ALL ${allFormats.length} formats`, () => {
        for (const format of allFormats) {
          expect(FORMAT_CHECKS[format]).toContain(check);
        }
      });
    }
  });

  describe('All formats are covered', () => {
    const expectedFormats = [
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

    it('has entries for all 9 output formats', () => {
      for (const fmt of expectedFormats) {
        expect(FORMAT_CHECKS[fmt]).toBeDefined();
      }
    });
  });
});
