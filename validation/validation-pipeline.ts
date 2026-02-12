/**
 * Validation pipeline orchestrator.
 * Runs validation stages in order: schema → business → profile.
 * Collects ALL errors (not fail-fast) for better usability.
 */

import type { XRechnungInvoiceData } from '@/services/xrechnung/types';
import { validateBusinessRules } from './business-rules';
import { validateXRechnungRules } from './xrechnung-rules';
import {
  buildValidationResult,
  createError,
  type ValidationError,
  type ValidationResult,
} from './validation-result';

const XRECHNUNG_PROFILE = 'xrechnung-3.0-cii';

/**
 * Stage 1: Schema validation — required fields and type checks.
 */
function validateSchema(data: XRechnungInvoiceData): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!data.invoiceNumber?.trim()) {
    errors.push(createError('SCHEMA-001', 'invoice.invoiceNumber', 'Invoice number is required'));
  }
  if (!data.invoiceDate?.trim()) {
    errors.push(createError('SCHEMA-002', 'invoice.invoiceDate', 'Invoice date is required'));
  }
  if (!data.sellerName?.trim()) {
    errors.push(createError('SCHEMA-003', 'invoice.seller.name', 'Seller name is required'));
  }
  if (!data.buyerName?.trim()) {
    errors.push(createError('SCHEMA-004', 'invoice.buyer.name', 'Buyer name is required'));
  }
  const docType = data.documentTypeCode ?? 380;
  if (data.totalAmount == null) {
    errors.push(createError('SCHEMA-005', 'invoice.totalAmount', 'Total amount is required'));
  } else if (!Number.isFinite(data.totalAmount)) {
    errors.push(
      createError('SCHEMA-005', 'invoice.totalAmount', 'Total amount must be a valid number')
    );
  } else if (docType !== 381 && data.totalAmount <= 0) {
    errors.push(
      createError('SCHEMA-005', 'invoice.totalAmount', 'Total amount must be greater than 0')
    );
  }
  if (!Array.isArray(data.lineItems) || data.lineItems.length === 0) {
    errors.push(
      createError('SCHEMA-006', 'invoice.lineItems', 'At least one line item is required')
    );
  }

  return errors;
}

/**
 * Run the full validation pipeline for XRechnung 3.0 CII.
 * Returns structured validation result with all errors and warnings.
 */
export function validateForXRechnung(data: XRechnungInvoiceData): ValidationResult {
  const allEntries: ValidationError[] = [];

  // Stage 1: Schema validation
  allEntries.push(...validateSchema(data));

  // Stage 2: Business rules (BR-CO monetary cross-checks)
  // Only run if schema basics pass (need line items and totals)
  if (Array.isArray(data.lineItems) && data.lineItems.length > 0) {
    allEntries.push(...validateBusinessRules(data));
  }

  // Stage 3: Profile rules (BR-DE for XRechnung)
  allEntries.push(...validateXRechnungRules(data));

  return buildValidationResult(XRECHNUNG_PROFILE, allEntries);
}
