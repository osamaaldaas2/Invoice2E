/**
 * KSeF FA(3) profile-specific validation rules.
 * Polish national e-invoicing business rules for KSeF 2.0.
 *
 * FA(3) is mandatory since 1 February 2026 (KSeF 2.0 production).
 * FA(2) is no longer accepted.
 */

import type { CanonicalInvoice } from '@/types/canonical-invoice';
import { createError, type ValidationError } from './validation-result';

const VALID_POLISH_TAX_RATES = [23, 22, 8, 7, 5, 0];
const VALID_POLISH_TAX_RATE_STRINGS = ['23', '22', '8', '7', '5', '0', 'zw', 'np', 'oo'];

/** Extract NIP digits from vatId/taxNumber */
function extractNIPDigits(party: {
  vatId?: string | null;
  taxNumber?: string | null;
  taxId?: string | null;
}): string {
  const raw = party.taxNumber || party.vatId || party.taxId || '';
  return raw.replace(/^PL/i, '').replace(/\D/g, '');
}

/**
 * Run all KSeF FA(3) profile validation rules.
 */
export function validateKsefRules(data: CanonicalInvoice): ValidationError[] {
  const errors: ValidationError[] = [];

  // KSEF-01: Seller NIP required (10-digit Polish tax ID)
  const sellerNIP = extractNIPDigits(data.seller);
  if (!sellerNIP || sellerNIP.length !== 10) {
    errors.push(
      createError(
        'KSEF-01',
        'invoice.seller.vatId',
        'Seller NIP (10-digit Polish tax ID) is required for KSeF',
        { expected: '10-digit NIP', actual: sellerNIP || '(empty)' }
      )
    );
  }

  // KSEF-02: Buyer NIP or name required
  const buyerNIP = extractNIPDigits(data.buyer);
  if (!buyerNIP && !data.buyer?.name?.trim()) {
    errors.push(createError('KSEF-02', 'invoice.buyer', 'Buyer NIP or name is required for KSeF'));
  }

  // KSEF-03: Invoice number required (max 256 chars)
  if (!data.invoiceNumber?.trim()) {
    errors.push(
      createError('KSEF-03', 'invoice.invoiceNumber', 'Invoice number is required for KSeF')
    );
  } else if (data.invoiceNumber.length > 256) {
    errors.push(
      createError(
        'KSEF-03',
        'invoice.invoiceNumber',
        'Invoice number must not exceed 256 characters'
      )
    );
  }

  // KSEF-04: Issue date required
  if (!data.invoiceDate?.trim()) {
    errors.push(
      createError('KSEF-04', 'invoice.invoiceDate', 'Invoice issue date is required for KSeF')
    );
  }

  // KSEF-05: Currency code required
  if (!data.currency?.trim()) {
    errors.push(
      createError('KSEF-05', 'invoice.currency', 'Currency code (ISO 4217) is required for KSeF')
    );
  }

  // KSEF-06: At least one line item
  if (!data.lineItems || data.lineItems.length === 0) {
    errors.push(
      createError('KSEF-06', 'invoice.lineItems', 'At least one line item is required for KSeF')
    );
  }

  // KSEF-07: Line item validation
  if (data.lineItems) {
    data.lineItems.forEach((item, idx) => {
      const loc = `invoice.lineItems[${idx}]`;

      if (!item.description?.trim()) {
        errors.push(
          createError(
            'KSEF-07',
            `${loc}.description`,
            `Line item ${idx + 1}: description is required`
          )
        );
      }

      if (item.quantity === undefined || item.quantity === null) {
        errors.push(
          createError('KSEF-07', `${loc}.quantity`, `Line item ${idx + 1}: quantity is required`)
        );
      }

      if (item.unitPrice === undefined || item.unitPrice === null) {
        errors.push(
          createError('KSEF-07', `${loc}.unitPrice`, `Line item ${idx + 1}: unit price is required`)
        );
      }

      if (item.taxRate === undefined || item.taxRate === null) {
        errors.push(
          createError('KSEF-07', `${loc}.taxRate`, `Line item ${idx + 1}: tax rate is required`)
        );
      } else if (
        !VALID_POLISH_TAX_RATES.includes(item.taxRate) &&
        !VALID_POLISH_TAX_RATE_STRINGS.includes(String(item.taxRate))
      ) {
        // FA(3) supports non-standard rates via P_13_11/P_14_11, but they are unusual.
        // Still flag as a warning-level error for review (not blocking).
        errors.push(
          createError(
            'KSEF-08',
            `${loc}.taxRate`,
            `Line item ${idx + 1}: non-standard Polish tax rate (will be mapped to P_13_11/P_14_11)`,
            { expected: '23, 22, 8, 7, 5, 0, zw, or np', actual: String(item.taxRate) }
          )
        );
      }
    });
  }

  // KSEF-09: Total amount required
  if (!data.totals || data.totals.totalAmount === undefined || data.totals.totalAmount === null) {
    errors.push(
      createError('KSEF-09', 'invoice.totals.totalAmount', 'Total amount is required for KSeF')
    );
  }

  return errors;
}
