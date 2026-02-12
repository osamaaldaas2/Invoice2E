import { describe, it, expect } from 'vitest';
import {
  validateMonetaryCrossChecks,
  groupByTaxRate,
  recomputeTotals,
  deriveTaxCategoryCode,
  type MonetaryTotals,
} from '@/lib/monetary-validator';

describe('monetary-validator', () => {
  describe('validateMonetaryCrossChecks', () => {
    it('passes for a valid single-rate invoice', () => {
      const totals: MonetaryTotals = {
        lineItems: [
          { netAmount: 100.0, taxRate: 19 },
          { netAmount: 200.0, taxRate: 19 },
        ],
        subtotal: 300.0,
        taxAmount: 57.0,
        totalAmount: 357.0,
      };
      const errors = validateMonetaryCrossChecks(totals);
      expect(errors).toHaveLength(0);
    });

    it('passes for a valid multi-rate invoice', () => {
      // 19% on 200, 7% on 100 => tax = 38 + 7 = 45, total = 345
      const totals: MonetaryTotals = {
        lineItems: [
          { netAmount: 200.0, taxRate: 19 },
          { netAmount: 100.0, taxRate: 7 },
        ],
        subtotal: 300.0,
        taxAmount: 45.0,
        totalAmount: 345.0,
      };
      const errors = validateMonetaryCrossChecks(totals);
      expect(errors).toHaveLength(0);
    });

    it('passes for zero-tax (exempt) invoice', () => {
      const totals: MonetaryTotals = {
        lineItems: [{ netAmount: 500.0, taxRate: 0, taxCategoryCode: 'E' }],
        subtotal: 500.0,
        taxAmount: 0.0,
        totalAmount: 500.0,
      };
      const errors = validateMonetaryCrossChecks(totals);
      expect(errors).toHaveLength(0);
    });

    it('detects BR-CO-10: line sum != subtotal', () => {
      const totals: MonetaryTotals = {
        lineItems: [
          { netAmount: 100.0, taxRate: 19 },
          { netAmount: 200.0, taxRate: 19 },
        ],
        subtotal: 350.0, // Wrong! Should be 300
        taxAmount: 57.0,
        totalAmount: 407.0,
      };
      const errors = validateMonetaryCrossChecks(totals);
      expect(errors.some((e) => e.ruleId === 'BR-CO-10')).toBe(true);
    });

    it('detects BR-CO-15: total != subtotal + tax', () => {
      const totals: MonetaryTotals = {
        lineItems: [{ netAmount: 100.0, taxRate: 19 }],
        subtotal: 100.0,
        taxAmount: 19.0,
        totalAmount: 200.0, // Wrong! Should be 119
      };
      const errors = validateMonetaryCrossChecks(totals);
      expect(errors.some((e) => e.ruleId === 'BR-CO-15')).toBe(true);
    });

    it('detects BR-CO-14: tax amount mismatch per group', () => {
      const totals: MonetaryTotals = {
        lineItems: [{ netAmount: 100.0, taxRate: 19 }],
        subtotal: 100.0,
        taxAmount: 25.0, // Wrong! Should be 19
        totalAmount: 125.0,
      };
      const errors = validateMonetaryCrossChecks(totals);
      expect(errors.some((e) => e.ruleId === 'BR-CO-14-SUM')).toBe(true);
    });

    it('handles 100+ line items without drift', () => {
      const items = Array.from({ length: 100 }, () => ({
        netAmount: 33.33,
        taxRate: 19,
      }));
      const subtotal = 3333.0;
      const taxAmount = 633.27;
      const totals: MonetaryTotals = {
        lineItems: items,
        subtotal,
        taxAmount,
        totalAmount: 3966.27,
      };
      const errors = validateMonetaryCrossChecks(totals);
      expect(errors).toHaveLength(0);
    });

    it('handles rounding at 0.005 boundary', () => {
      // 33.33 * 19% = 6.3327 -> rounds to 6.33
      const totals: MonetaryTotals = {
        lineItems: [{ netAmount: 33.33, taxRate: 19 }],
        subtotal: 33.33,
        taxAmount: 6.33,
        totalAmount: 39.66,
      };
      const errors = validateMonetaryCrossChecks(totals);
      expect(errors).toHaveLength(0);
    });
  });

  describe('groupByTaxRate', () => {
    it('groups items by rate', () => {
      const groups = groupByTaxRate([
        { netAmount: 100, taxRate: 19 },
        { netAmount: 50, taxRate: 7 },
        { netAmount: 200, taxRate: 19 },
      ]);
      expect(groups).toHaveLength(2);
      expect(groups[0]).toMatchObject({ taxRate: 19, taxableAmount: 300 });
      expect(groups[1]).toMatchObject({ taxRate: 7, taxableAmount: 50 });
    });

    it('uses explicit tax category code when provided', () => {
      const groups = groupByTaxRate([{ netAmount: 100, taxRate: 0, taxCategoryCode: 'AE' }]);
      expect(groups[0]?.taxCategoryCode).toBe('AE');
    });

    it('derives category code from rate when not provided', () => {
      const groups = groupByTaxRate([
        { netAmount: 100, taxRate: 19 },
        { netAmount: 50, taxRate: 0 },
      ]);
      expect(groups.find((g) => g.taxRate === 19)?.taxCategoryCode).toBe('S');
      expect(groups.find((g) => g.taxRate === 0)?.taxCategoryCode).toBe('E');
    });
  });

  describe('recomputeTotals', () => {
    it('computes correct totals from line items', () => {
      const result = recomputeTotals([
        { netAmount: 100, taxRate: 19 },
        { netAmount: 200, taxRate: 7 },
      ]);
      expect(result.subtotal).toBe(300);
      expect(result.taxAmount).toBe(33); // 19 + 14
      expect(result.totalAmount).toBe(333);
    });
  });

  describe('deriveTaxCategoryCode', () => {
    it('returns S for positive rate', () => {
      expect(deriveTaxCategoryCode(19)).toBe('S');
    });
    it('returns E for zero rate', () => {
      expect(deriveTaxCategoryCode(0)).toBe('E');
    });
  });
});
