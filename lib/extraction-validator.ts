/**
 * Phase 3: Mathematical Validation
 * Validates extracted invoice data mathematically.
 * VALIDATION ONLY — never modifies data.
 */

import type { ExtractedInvoiceData } from '@/types';
import { EXTRACTION_VALIDATION_TOLERANCE } from '@/lib/constants';

export interface ExtractionValidationError {
  field: string;
  message: string;
  expected?: number;
  actual?: number;
}

export interface ExtractionValidationResult {
  valid: boolean;
  errors: ExtractionValidationError[];
}

function approxEqual(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance;
}

export function validateExtraction(data: ExtractedInvoiceData): ExtractionValidationResult {
  const errors: ExtractionValidationError[] = [];
  const tol = EXTRACTION_VALIDATION_TOLERANCE;

  // Required fields
  if (!data.invoiceNumber)
    errors.push({ field: 'invoiceNumber', message: 'Missing invoice number' });
  if (!data.invoiceDate) errors.push({ field: 'invoiceDate', message: 'Missing invoice date' });
  if (!data.sellerName) errors.push({ field: 'sellerName', message: 'Missing seller name' });
  if (!data.buyerName) errors.push({ field: 'buyerName', message: 'Missing buyer name' });

  // At least 1 line item
  if (!data.lineItems || data.lineItems.length === 0) {
    errors.push({ field: 'lineItems', message: 'At least 1 line item required' });
    return { valid: errors.length === 0, errors };
  }

  // Non-negative monetary values
  for (const [field, value] of Object.entries({
    subtotal: data.subtotal,
    taxAmount: data.taxAmount,
    totalAmount: data.totalAmount,
  })) {
    if (typeof value === 'number' && value < 0) {
      errors.push({ field, message: `${field} must be non-negative`, actual: value });
    }
  }

  // Line item validation
  let lineItemSum = 0;
  for (let i = 0; i < data.lineItems.length; i++) {
    const item = data.lineItems[i]!;
    const expected = item.unitPrice * item.quantity;
    if (!approxEqual(expected, item.totalPrice, tol.LINE_ITEM)) {
      errors.push({
        field: `lineItems[${i}].totalPrice`,
        message: `unitPrice × quantity ≠ totalPrice`,
        expected: Math.round(expected * 100) / 100,
        actual: item.totalPrice,
      });
    }
    if (item.unitPrice < 0)
      errors.push({
        field: `lineItems[${i}].unitPrice`,
        message: 'unitPrice must be non-negative',
        actual: item.unitPrice,
      });
    if (item.totalPrice < 0)
      errors.push({
        field: `lineItems[${i}].totalPrice`,
        message: 'totalPrice must be non-negative',
        actual: item.totalPrice,
      });
    lineItemSum += item.totalPrice;
  }

  // sum(lineItems.totalPrice) ≈ subtotal
  if (typeof data.subtotal === 'number' && !approxEqual(lineItemSum, data.subtotal, tol.SUBTOTAL)) {
    errors.push({
      field: 'subtotal',
      message: 'sum(lineItems.totalPrice) ≠ subtotal',
      expected: Math.round(lineItemSum * 100) / 100,
      actual: data.subtotal,
    });
  }

  // taxAmount ≈ subtotal × taxRate / 100
  if (typeof data.taxRate === 'number' && data.taxRate > 0 && typeof data.subtotal === 'number') {
    const expectedTax = (data.subtotal * data.taxRate) / 100;
    if (!approxEqual(expectedTax, data.taxAmount, tol.TAX)) {
      errors.push({
        field: 'taxAmount',
        message: 'taxAmount ≠ subtotal × taxRate / 100',
        expected: Math.round(expectedTax * 100) / 100,
        actual: data.taxAmount,
      });
    }
  }

  // subtotal + taxAmount ≈ totalAmount
  if (typeof data.subtotal === 'number') {
    const expectedTotal = data.subtotal + data.taxAmount;
    if (!approxEqual(expectedTotal, data.totalAmount, tol.TOTAL)) {
      errors.push({
        field: 'totalAmount',
        message: 'subtotal + taxAmount ≠ totalAmount',
        expected: Math.round(expectedTotal * 100) / 100,
        actual: data.totalAmount,
      });
    }
  }

  return { valid: errors.length === 0, errors };
}
