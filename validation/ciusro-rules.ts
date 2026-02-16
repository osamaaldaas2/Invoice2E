/**
 * CIUS-RO profile-specific validation rules (Romania).
 * Extends PEPPOL BIS rules with Romanian-specific requirements.
 */

import type { CanonicalInvoice } from '@/types/canonical-invoice';
import { createError, type ValidationError } from './validation-result';
import { validatePeppolRules } from './peppol-rules';

/** Romanian CUI/CIF: optional "RO" prefix + 1-10 digits */
const CUI_PATTERN = /^(RO)?\d{1,10}$/;

/** Romanian VAT ID: RO + 2-10 digits */
const RO_VAT_PATTERN = /^RO\d{2,10}$/;

/**
 * Run all CIUS-RO specific validation rules.
 * Includes PEPPOL rules + Romanian-specific rules.
 */
export function validateCIUSRORules(data: CanonicalInvoice): ValidationError[] {
  // Start with PEPPOL rules
  const errors = validatePeppolRules(data);

  // Seller CUI/CIF validation
  const sellerTaxNum = data.seller?.taxNumber?.trim();
  if (sellerTaxNum && !CUI_PATTERN.test(sellerTaxNum)) {
    errors.push(
      createError(
        'CIUS-RO-CUI-FORMAT',
        'invoice.seller.taxNumber',
        `Romanian CUI/CIF must be optional "RO" prefix + up to 10 digits, got "${sellerTaxNum}"`,
        { suggestion: 'Format: RO + up to 10 digits or just up to 10 digits (e.g. RO12345678 or 12345678)' },
      ),
    );
  }

  // Seller VAT ID format for Romanian entities
  const sellerVat = data.seller?.vatId?.trim();
  if (sellerVat && sellerVat.startsWith('RO') && !RO_VAT_PATTERN.test(sellerVat)) {
    errors.push(
      createError(
        'CIUS-RO-VAT-FORMAT',
        'invoice.seller.vatId',
        `Romanian VAT ID must be RO + 2–10 digits, got "${sellerVat}"`,
        { suggestion: 'Format: RO + 2 to 10 digits (e.g. RO12345678)' },
      ),
    );
  }

  // Buyer CUI/CIF validation
  const buyerTaxNum = data.buyer?.taxNumber?.trim();
  if (buyerTaxNum && !CUI_PATTERN.test(buyerTaxNum)) {
    errors.push(
      createError(
        'CIUS-RO-CUI-FORMAT',
        'invoice.buyer.taxNumber',
        `Romanian CUI/CIF must be optional "RO" prefix + up to 10 digits, got "${buyerTaxNum}"`,
        { suggestion: 'Format: RO + up to 10 digits or just up to 10 digits' },
      ),
    );
  }

  // Buyer VAT ID format for Romanian entities
  const buyerVat = data.buyer?.vatId?.trim();
  if (buyerVat && buyerVat.startsWith('RO') && !RO_VAT_PATTERN.test(buyerVat)) {
    errors.push(
      createError(
        'CIUS-RO-VAT-FORMAT',
        'invoice.buyer.vatId',
        `Romanian VAT ID must be RO + 2–10 digits, got "${buyerVat}"`,
        { suggestion: 'Format: RO + 2 to 10 digits (e.g. RO12345678)' },
      ),
    );
  }

  // Seller country should be RO (warning-level, not blocking)
  const sellerCountry = data.seller?.countryCode?.trim();
  if (sellerCountry && sellerCountry !== 'RO') {
    // Not an error per se, but noteworthy for CIUS-RO
  }

  return errors;
}
