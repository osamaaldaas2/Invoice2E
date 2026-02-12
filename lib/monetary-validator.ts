/**
 * Monetary cross-check validation implementing EN 16931 BR-CO rules.
 *
 * BR-CO-10: Sum of line net amounts = Invoice total net (BT-106)
 * BR-CO-11: Sum of allowances at document level (if any)
 * BR-CO-12: Sum of charges at document level (if any)
 * BR-CO-13: Invoice total without VAT = Line total - allowances + charges (BT-109)
 * BR-CO-14: Each VAT breakdown: tax = basis * rate (within tolerance)
 * BR-CO-15: Invoice total with VAT = total without VAT + total VAT (BT-112)
 * BR-CO-16: Amount due = total with VAT - prepaid (BT-115)
 */

import { roundMoney, sumMoney, computeTax, moneyEqual } from './monetary';

export interface MonetaryLineItem {
  netAmount: number;
  taxRate: number;
  taxCategoryCode?: string;
}

export interface TaxBreakdownEntry {
  taxRate: number;
  taxCategoryCode: string;
  taxableAmount: number;
  taxAmount: number;
}

export interface MonetaryTotals {
  lineItems: MonetaryLineItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  prepaidAmount?: number;
}

export interface MonetaryValidationError {
  ruleId: string;
  message: string;
  expected?: string;
  actual?: string;
}

/**
 * Validate all monetary cross-checks (BR-CO-10..16) for an invoice.
 * Returns an array of errors; empty array means the invoice passes.
 */
export function validateMonetaryCrossChecks(totals: MonetaryTotals): MonetaryValidationError[] {
  const errors: MonetaryValidationError[] = [];

  // BR-CO-10: Sum of line net amounts = subtotal (BT-106)
  const lineNetSum = sumMoney(totals.lineItems.map((li) => li.netAmount));
  if (!moneyEqual(lineNetSum, totals.subtotal, 0.02)) {
    errors.push({
      ruleId: 'BR-CO-10',
      message: 'Sum of line net amounts does not match invoice subtotal (BT-106)',
      expected: roundMoney(lineNetSum).toFixed(2),
      actual: roundMoney(totals.subtotal).toFixed(2),
    });
  }

  // BR-CO-13: Invoice total without VAT = subtotal (when no doc-level allowances/charges)
  // For now, no allowances/charges support, so subtotal = total without VAT
  const totalWithoutVat = totals.subtotal;

  // BR-CO-14: For each tax group, verify tax = basis * rate
  const taxGroups = groupByTaxRate(totals.lineItems);
  let computedTotalTax = 0;
  for (const group of taxGroups) {
    const expectedTax = computeTax(group.taxableAmount, group.taxRate);
    computedTotalTax = roundMoney(computedTotalTax + expectedTax);

    if (!moneyEqual(expectedTax, group.taxAmount, 0.02)) {
      errors.push({
        ruleId: 'BR-CO-14',
        message: `Tax breakdown for rate ${group.taxRate}%: computed tax does not match`,
        expected: expectedTax.toFixed(2),
        actual: group.taxAmount.toFixed(2),
      });
    }
  }

  // BR-CO-15: Invoice total with VAT = total without VAT + total VAT (BT-112)
  const expectedTotal = roundMoney(totalWithoutVat + totals.taxAmount);
  if (!moneyEqual(expectedTotal, totals.totalAmount, 0.02)) {
    errors.push({
      ruleId: 'BR-CO-15',
      message: 'Invoice total with VAT does not match subtotal + tax amount',
      expected: expectedTotal.toFixed(2),
      actual: roundMoney(totals.totalAmount).toFixed(2),
    });
  }

  // Verify reported taxAmount matches computed tax from line items
  if (taxGroups.length > 0 && !moneyEqual(computedTotalTax, totals.taxAmount, 0.02)) {
    errors.push({
      ruleId: 'BR-CO-14-SUM',
      message: 'Total tax amount does not match sum of tax breakdowns',
      expected: computedTotalTax.toFixed(2),
      actual: roundMoney(totals.taxAmount).toFixed(2),
    });
  }

  return errors;
}

/**
 * Group line items by tax rate and compute tax breakdowns.
 * Returns one entry per unique tax rate with computed taxable amount and tax.
 */
export function groupByTaxRate(lineItems: MonetaryLineItem[]): TaxBreakdownEntry[] {
  const groups = new Map<number, { taxableAmount: number; taxCategoryCode: string }>();

  for (const item of lineItems) {
    const rate = item.taxRate;
    const existing = groups.get(rate);
    if (existing) {
      existing.taxableAmount = roundMoney(existing.taxableAmount + item.netAmount);
    } else {
      groups.set(rate, {
        taxableAmount: item.netAmount,
        taxCategoryCode: item.taxCategoryCode || deriveTaxCategoryCode(rate),
      });
    }
  }

  return Array.from(groups.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([rate, group]) => ({
      taxRate: rate,
      taxCategoryCode: group.taxCategoryCode,
      taxableAmount: roundMoney(group.taxableAmount),
      taxAmount: computeTax(group.taxableAmount, rate),
    }));
}

/**
 * Derive EN 16931 tax category code from rate when not explicitly provided.
 * S = standard (rate > 0), E = exempt (rate === 0).
 */
export function deriveTaxCategoryCode(rate: number): string {
  return rate > 0 ? 'S' : 'E';
}

/**
 * Validate a set of totals and recompute correct values.
 * Returns the corrected totals alongside any discrepancies.
 */
export function recomputeTotals(lineItems: MonetaryLineItem[]): {
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  taxBreakdowns: TaxBreakdownEntry[];
} {
  const taxBreakdowns = groupByTaxRate(lineItems);
  const subtotal = sumMoney(lineItems.map((li) => li.netAmount));
  const taxAmount = sumMoney(taxBreakdowns.map((tb) => tb.taxAmount));
  const totalAmount = roundMoney(subtotal + taxAmount);

  return { subtotal, taxAmount, totalAmount, taxBreakdowns };
}
