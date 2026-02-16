/**
 * NET vs GROSS semantic detection tests.
 * Validates that the system detects when line item totalPrice is GROSS instead of NET.
 *
 * Related to bug fix: BR-CO-10 and BR-CO-14-SUM failures caused by AI extracting
 * GROSS line totals from invoices.
 */

import { describe, it, expect } from 'vitest';
import { validateBusinessRules } from '@/validation/business-rules';
import type { CanonicalInvoice } from '@/types/canonical-invoice';

/** Helper to create a minimal CanonicalInvoice for business rule testing */
function createTestInvoice(overrides: Partial<CanonicalInvoice> & {
  lineItems: CanonicalInvoice['lineItems'];
  totals: CanonicalInvoice['totals'];
}): CanonicalInvoice {
  return {
    outputFormat: 'xrechnung-cii',
    invoiceNumber: 'TEST-001',
    invoiceDate: '2026-02-13',
    currency: 'EUR',
    seller: { name: 'Test Seller' },
    buyer: { name: 'Test Buyer' },
    payment: {},
    ...overrides,
  };
}

describe('NET vs GROSS semantic detection', () => {
  describe('GROSS line total detection', () => {
    it('should detect and report when line item totalPrice is GROSS instead of NET', () => {
      const invoice = createTestInvoice({
        lineItems: [
          {
            description: 'Test Item',
            quantity: 1,
            unitPrice: 19.9,
            totalPrice: 23.68, // WRONG: This is GROSS (should be 19.9 NET)
            taxRate: 19,
            taxCategoryCode: 'S',
          },
        ],
        totals: { subtotal: 19.9, taxAmount: 3.78, totalAmount: 23.68 },
      });

      const errors = validateBusinessRules(invoice);

      // Should contain semantic error about NET vs GROSS
      const semanticError = errors.find((e) => e.ruleId === 'SEMANTIC-NET-GROSS');
      expect(semanticError).toBeDefined();
      expect(semanticError?.message).toContain('appears to be GROSS');
      expect(semanticError?.message).toContain('EN 16931 requires NET');
      expect(semanticError?.expected).toBe('19.90');
      expect(semanticError?.actual).toBe('23.68');

      // Should also fail BR-CO-10 (sum of line net != subtotal)
      const brCo10Error = errors.find((e) => e.ruleId === 'BR-CO-10');
      expect(brCo10Error).toBeDefined();
    });

    it('should detect GROSS with multiple line items', () => {
      const invoice = createTestInvoice({
        lineItems: [
          {
            description: 'Item 1',
            quantity: 1,
            unitPrice: 19.9,
            totalPrice: 23.68, // GROSS
            taxRate: 19,
            taxCategoryCode: 'S',
          },
          {
            description: 'Item 2',
            quantity: 1,
            unitPrice: 19.9,
            totalPrice: 23.68, // GROSS
            taxRate: 19,
            taxCategoryCode: 'S',
          },
        ],
        totals: { subtotal: 39.8, taxAmount: 7.56, totalAmount: 47.36 },
      });

      const errors = validateBusinessRules(invoice);

      // Should detect GROSS in both line items
      const semanticErrors = errors.filter((e) => e.ruleId === 'SEMANTIC-NET-GROSS');
      expect(semanticErrors.length).toBe(2);
    });
  });

  describe('NET line total acceptance', () => {
    it('should pass when line item totalPrice is correctly NET', () => {
      const invoice = createTestInvoice({
        lineItems: [
          {
            description: 'Test Item',
            quantity: 1,
            unitPrice: 19.9,
            totalPrice: 19.9, // CORRECT: NET
            taxRate: 19,
            taxCategoryCode: 'S',
          },
        ],
        totals: { subtotal: 19.9, taxAmount: 3.78, totalAmount: 23.68 },
      });

      const errors = validateBusinessRules(invoice);

      const semanticError = errors.find((e) => e.ruleId === 'SEMANTIC-NET-GROSS');
      expect(semanticError).toBeUndefined();

      const brCo10Error = errors.find((e) => e.ruleId === 'BR-CO-10');
      expect(brCo10Error).toBeUndefined();

      const brCo14Error = errors.find((e) => e.ruleId === 'BR-CO-14-SUM');
      expect(brCo14Error).toBeUndefined();
    });

    it('should allow small rounding differences in NET totals', () => {
      const invoice = createTestInvoice({
        lineItems: [
          {
            description: 'Test Item',
            quantity: 3,
            unitPrice: 33.33,
            totalPrice: 99.99, // 3 × 33.33 = 99.99 (exact)
            taxRate: 19,
            taxCategoryCode: 'S',
          },
        ],
        totals: { subtotal: 99.99, taxAmount: 19.05, totalAmount: 119.04 },
      });

      const errors = validateBusinessRules(invoice);

      const semanticError = errors.find((e) => e.ruleId === 'SEMANTIC-NET-GROSS');
      expect(semanticError).toBeUndefined();
    });
  });

  describe('Edge cases', () => {
    it('should not flag items with zero tax rate', () => {
      const invoice = createTestInvoice({
        lineItems: [
          {
            description: 'Tax-exempt item',
            quantity: 1,
            unitPrice: 100.0,
            totalPrice: 100.0,
            taxRate: 0,
            taxCategoryCode: 'E',
          },
        ],
        totals: { subtotal: 100.0, taxAmount: 0, totalAmount: 100.0 },
      });

      const errors = validateBusinessRules(invoice);

      const semanticError = errors.find((e) => e.ruleId === 'SEMANTIC-NET-GROSS');
      expect(semanticError).toBeUndefined();
    });

    it('should detect when totalPrice is way off (not just GROSS)', () => {
      const invoice = createTestInvoice({
        lineItems: [
          {
            description: 'Incorrect total',
            quantity: 1,
            unitPrice: 19.9,
            totalPrice: 50.0, // Way off (not NET, not GROSS)
            taxRate: 19,
            taxCategoryCode: 'S',
          },
        ],
        totals: { subtotal: 50.0, taxAmount: 9.5, totalAmount: 50.0 },
      });

      const errors = validateBusinessRules(invoice);

      const semanticErrors = errors.filter(
        (e) => e.ruleId === 'SEMANTIC-NET-GROSS' || e.ruleId === 'SEMANTIC-LINE-TOTAL-MISMATCH'
      );
      expect(semanticErrors.length).toBeGreaterThan(0);
    });
  });
});
