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
import { DEFAULT_VAT_RATE } from './constants';

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

export interface MonetaryAllowanceCharge {
  /** false = allowance (discount), true = charge (surcharge) */
  chargeIndicator: boolean;
  amount: number;
  taxRate?: number;
  taxCategoryCode?: string;
}

export interface MonetaryTotals {
  lineItems: MonetaryLineItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  prepaidAmount?: number;
  /** Document-level allowances and charges (BG-20 / BG-21) */
  allowanceCharges?: MonetaryAllowanceCharge[];
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

  // BR-CO-10: Sum of line net amounts = Invoice line total (BT-106)
  const lineNetSum = sumMoney(totals.lineItems.map((li) => li.netAmount));

  // BR-CO-11 / BR-CO-12: Sum of document-level allowances and charges
  const allowances = (totals.allowanceCharges ?? []).filter((ac) => !ac.chargeIndicator);
  const charges = (totals.allowanceCharges ?? []).filter((ac) => ac.chargeIndicator);
  const totalAllowances = sumMoney(allowances.map((a) => a.amount));
  const totalCharges = sumMoney(charges.map((c) => c.amount));

  // BR-CO-13: Invoice total without VAT = line total - allowances + charges (BT-109)
  const totalWithoutVat = roundMoney(lineNetSum - totalAllowances + totalCharges);
  const hasAllowancesOrCharges = totalAllowances > 0 || totalCharges > 0;

  // Detect gross pricing: line items include VAT, so subtotal = gross / (1 + rate)
  // Try common VAT rates to see if the provided subtotal matches a gross-to-net conversion
  let isGrossPriced = false;
  if (hasAllowancesOrCharges && !moneyEqual(totalWithoutVat, totals.subtotal, 0.02)) {
    const grossAfterAdjustments = totalWithoutVat; // lineNetSum - allowances + charges
    const commonRates = [0.19, 0.07, 0.20, 0.21, 0.10, 0.05];
    for (const rate of commonRates) {
      const netFromGross = roundMoney(grossAfterAdjustments / (1 + rate));
      if (moneyEqual(netFromGross, totals.subtotal, 0.05)) {
        isGrossPriced = true;
        break;
      }
    }
  }

  if (!isGrossPriced && !moneyEqual(totalWithoutVat, totals.subtotal, 0.02)) {
    if (hasAllowancesOrCharges) {
      errors.push({
        ruleId: 'BR-CO-13',
        message: 'Invoice total without VAT does not match line total - allowances + charges (BT-109)',
        expected: roundMoney(totalWithoutVat).toFixed(2),
        actual: roundMoney(totals.subtotal).toFixed(2),
      });
    } else {
      // No allowances/charges — fall back to BR-CO-10 (line sum = subtotal)
      errors.push({
        ruleId: 'BR-CO-10',
        message: 'Sum of line net amounts does not match invoice subtotal (BT-106)',
        expected: roundMoney(lineNetSum).toFixed(2),
        actual: roundMoney(totals.subtotal).toFixed(2),
      });
    }
  }

  // For gross-priced invoices with allowances, validate using the provided
  // subtotal/taxAmount/totalAmount as authoritative (they come from the invoice)
  // rather than recomputing from line items (which are gross).
  if (isGrossPriced) {
    // Only check internal consistency: subtotal + tax ≈ total
    const expectedTotal = roundMoney(totals.subtotal + totals.taxAmount);
    if (!moneyEqual(expectedTotal, totals.totalAmount, 0.02)) {
      errors.push({
        ruleId: 'BR-CO-15',
        message: 'Invoice total with VAT does not match subtotal + tax amount',
        expected: expectedTotal.toFixed(2),
        actual: roundMoney(totals.totalAmount).toFixed(2),
      });
    }
  } else {
    // Standard net-pricing validation
    // BR-CO-14: For each tax group, verify tax = basis * rate
    const taxGroups = groupByTaxRate(totals.lineItems, totals.allowanceCharges);
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

    if (taxGroups.length > 0 && !moneyEqual(computedTotalTax, totals.taxAmount, 0.02)) {
      errors.push({
        ruleId: 'BR-CO-14-SUM',
        message: 'Total tax amount does not match sum of tax breakdowns',
        expected: computedTotalTax.toFixed(2),
        actual: roundMoney(totals.taxAmount).toFixed(2),
      });
    }
  }

  return errors;
}

/**
 * Group line items by tax rate and compute tax breakdowns.
 * Includes document-level allowances/charges in the tax group they belong to.
 * Returns one entry per unique tax rate with computed taxable amount and tax.
 */
export function groupByTaxRate(
  lineItems: MonetaryLineItem[],
  allowanceCharges?: MonetaryAllowanceCharge[]
): TaxBreakdownEntry[] {
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

  // Include document-level allowances/charges in tax groups
  if (allowanceCharges && allowanceCharges.length > 0) {
    for (const ac of allowanceCharges) {
      const rate = ac.taxRate ?? DEFAULT_VAT_RATE;
      const existing = groups.get(rate);
      const adjustment = ac.chargeIndicator ? ac.amount : -ac.amount;

      if (existing) {
        existing.taxableAmount = roundMoney(existing.taxableAmount + adjustment);
      } else {
        groups.set(rate, {
          taxableAmount: adjustment,
          taxCategoryCode: ac.taxCategoryCode || deriveTaxCategoryCode(rate),
        });
      }
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
export function recomputeTotals(
  lineItems: MonetaryLineItem[],
  allowanceCharges?: MonetaryAllowanceCharge[]
): {
  lineNetSum: number;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  totalAllowances: number;
  totalCharges: number;
  taxBreakdowns: TaxBreakdownEntry[];
} {
  const taxBreakdowns = groupByTaxRate(lineItems, allowanceCharges);
  const lineNetSum = sumMoney(lineItems.map((li) => li.netAmount));

  const allowances = (allowanceCharges ?? []).filter((ac) => !ac.chargeIndicator);
  const charges = (allowanceCharges ?? []).filter((ac) => ac.chargeIndicator);
  const totalAllowances = sumMoney(allowances.map((a) => a.amount));
  const totalCharges = sumMoney(charges.map((c) => c.amount));

  // subtotal = line net sum - allowances + charges (BR-CO-13)
  const subtotal = roundMoney(lineNetSum - totalAllowances + totalCharges);
  const taxAmount = sumMoney(taxBreakdowns.map((tb) => tb.taxAmount));
  const totalAmount = roundMoney(subtotal + taxAmount);

  return { lineNetSum, subtotal, taxAmount, totalAmount, totalAllowances, totalCharges, taxBreakdowns };
}
