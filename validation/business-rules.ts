/**
 * EN 16931 Business Rules — BR-CO (monetary cross-checks).
 * Validates monetary integrity of invoice data before XML rendering.
 */

import type { XRechnungInvoiceData } from '@/services/xrechnung/types';
import { validateMonetaryCrossChecks, type MonetaryLineItem, type MonetaryAllowanceCharge } from '@/lib/monetary-validator';
import { roundMoney } from '@/lib/monetary';
import { DEFAULT_VAT_RATE } from '@/lib/constants';
import { createError, type ValidationError } from './validation-result';

/**
 * Run BR-CO monetary cross-check rules against invoice data.
 * Returns structured validation errors.
 *
 * F3: Includes semantic NET vs GROSS validation to catch extraction errors early.
 */
export function validateBusinessRules(data: XRechnungInvoiceData): ValidationError[] {
  const items = data.lineItems || [];
  if (items.length === 0) return [];

  const errors: ValidationError[] = [];

  // F3: Semantic validation - detect GROSS vs NET confusion
  const lineItems: MonetaryLineItem[] = items.map((item, index) => {
    const unitPrice = Number(item.unitPrice) || 0;
    const quantity = Number(item.quantity) || 1;
    const totalPrice = Number(item.totalPrice ?? item.lineTotal) || unitPrice * quantity;
    const rawRate = Number(item.taxRate ?? item.vatRate);
    const taxRate = Number.isFinite(rawRate) && rawRate >= 0 ? rawRate : DEFAULT_VAT_RATE;

    // F3: Check if totalPrice looks like GROSS instead of NET
    if (unitPrice > 0 && quantity > 0) {
      const expectedNet = roundMoney(unitPrice * quantity);
      const deviation = Math.abs(totalPrice - expectedNet);
      const deviationPercent = expectedNet > 0 ? deviation / expectedNet : 0;

      // Tolerance: max(1%, €0.05)
      const tolerancePercent = 0.01;
      const toleranceAbsolute = 0.05;
      const isSignificantDeviation =
        deviation > toleranceAbsolute && deviationPercent > tolerancePercent;

      if (isSignificantDeviation) {
        // Check if totalPrice looks like GROSS (expectedNet with tax added)
        const possibleGross = roundMoney(expectedNet * (1 + taxRate / 100));
        const deviationFromGross = Math.abs(totalPrice - possibleGross);

        if (deviationFromGross < 0.02) {
          // Very likely GROSS instead of NET
          errors.push(
            createError(
              'SEMANTIC-NET-GROSS',
              `invoice.lineItems[${index}]`,
              `Line item #${index + 1}: totalPrice (${totalPrice.toFixed(2)}) appears to be GROSS (includes VAT). EN 16931 requires NET line totals. Expected NET: ${expectedNet.toFixed(2)} (quantity × unitPrice). Fix: set totalPrice = quantity × unitPrice (before tax).`,
              {
                expected: expectedNet.toFixed(2),
                actual: totalPrice.toFixed(2),
              }
            )
          );
        } else {
          // Significant deviation but not clearly GROSS - generic warning
          errors.push(
            createError(
              'SEMANTIC-LINE-TOTAL-MISMATCH',
              `invoice.lineItems[${index}]`,
              `Line item #${index + 1}: totalPrice (${totalPrice.toFixed(2)}) does not match quantity × unitPrice. Expected: ${expectedNet.toFixed(2)} (${quantity} × ${unitPrice.toFixed(2)}). Verify line total is correct and is NET (before tax).`,
              {
                expected: expectedNet.toFixed(2),
                actual: totalPrice.toFixed(2),
              }
            )
          );
        }
      }
    }

    return {
      netAmount: roundMoney(totalPrice),
      taxRate,
      taxCategoryCode: item.taxCategoryCode,
    };
  });

  // Map document-level allowances/charges for monetary validation
  const monetaryAllowanceCharges: MonetaryAllowanceCharge[] = (data.allowanceCharges ?? []).map((ac) => ({
    chargeIndicator: ac.chargeIndicator,
    amount: Number(ac.amount) || 0,
    taxRate: ac.taxRate != null ? Number(ac.taxRate) : undefined,
    taxCategoryCode: ac.taxCategoryCode ?? undefined,
  }));

  // Run standard BR-CO monetary cross-checks
  const monetaryErrors = validateMonetaryCrossChecks({
    lineItems,
    subtotal: Number(data.subtotal) || 0,
    taxAmount: Number(data.taxAmount) || 0,
    totalAmount: Number(data.totalAmount) || 0,
    allowanceCharges: monetaryAllowanceCharges,
  });

  // Combine semantic errors with BR-CO errors
  return [
    ...errors,
    ...monetaryErrors.map((me) =>
      createError(me.ruleId, 'invoice.totals', me.message, {
        expected: me.expected,
        actual: me.actual,
      })
    ),
  ];
}
