/**
 * EN 16931 Business Rules — BR-CO (monetary cross-checks).
 * Validates monetary integrity of invoice data before XML rendering.
 */

import type { XRechnungInvoiceData } from '@/services/xrechnung/types';
import { validateMonetaryCrossChecks, type MonetaryLineItem } from '@/lib/monetary-validator';
import { roundMoney } from '@/lib/monetary';
import { DEFAULT_VAT_RATE } from '@/lib/constants';
import { createError, type ValidationError } from './validation-result';

/**
 * Run BR-CO monetary cross-check rules against invoice data.
 * Returns structured validation errors.
 */
export function validateBusinessRules(data: XRechnungInvoiceData): ValidationError[] {
  const items = data.lineItems || [];
  if (items.length === 0) return [];

  const lineItems: MonetaryLineItem[] = items.map((item) => {
    const unitPrice = Number(item.unitPrice) || 0;
    const quantity = Number(item.quantity) || 1;
    const totalPrice = Number(item.totalPrice ?? item.lineTotal) || unitPrice * quantity;
    const rawRate = Number(item.taxRate ?? item.vatRate);
    const taxRate = Number.isFinite(rawRate) && rawRate >= 0 ? rawRate : DEFAULT_VAT_RATE;

    return {
      netAmount: roundMoney(totalPrice),
      taxRate,
      taxCategoryCode: item.taxCategoryCode,
    };
  });

  const monetaryErrors = validateMonetaryCrossChecks({
    lineItems,
    subtotal: Number(data.subtotal) || 0,
    taxAmount: Number(data.taxAmount) || 0,
    totalAmount: Number(data.totalAmount) || 0,
  });

  return monetaryErrors.map((me) =>
    createError(me.ruleId, 'invoice.totals', me.message, {
      expected: me.expected,
      actual: me.actual,
    })
  );
}
