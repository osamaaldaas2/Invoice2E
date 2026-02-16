/**
 * NLCIUS / SI-UBL 2.0 profile-specific validation rules (Netherlands).
 * Extends PEPPOL BIS rules with Dutch-specific requirements.
 */

import type { CanonicalInvoice } from '@/types/canonical-invoice';
import { createError, type ValidationError } from './validation-result';
import { validatePeppolRules } from './peppol-rules';

/** OIN: exactly 20 digits */
const OIN_PATTERN = /^\d{20}$/;

/** KVK: exactly 8 digits */
const KVK_PATTERN = /^\d{8}$/;

/** Dutch BTW (VAT) format: NL + 9 digits + B + 2 digits */
const DUTCH_BTW_PATTERN = /^NL\d{9}B\d{2}$/;

/**
 * Validate an identifier as OIN (schemeID 0190) or KVK (schemeID 0106).
 */
function validateDutchEndpoint(
  address: string | null | undefined,
  scheme: string | null | undefined,
  party: 'Seller' | 'Buyer',
  fieldPrefix: string,
): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!address || !scheme) return errors;

  if (scheme === '0190' && !OIN_PATTERN.test(address)) {
    errors.push(
      createError(
        'NLCIUS-OIN-FORMAT',
        `${fieldPrefix}.electronicAddress`,
        `${party} OIN (schemeID 0190) must be exactly 20 digits, got "${address}"`,
        { suggestion: 'Provide a 20-digit OIN identifier' },
      ),
    );
  }

  if (scheme === '0106' && !KVK_PATTERN.test(address)) {
    errors.push(
      createError(
        'NLCIUS-KVK-FORMAT',
        `${fieldPrefix}.electronicAddress`,
        `${party} KVK number (schemeID 0106) must be exactly 8 digits, got "${address}"`,
        { suggestion: 'Provide an 8-digit KVK number' },
      ),
    );
  }

  return errors;
}

/**
 * Run all NLCIUS-specific validation rules.
 * Includes PEPPOL rules + Dutch-specific rules.
 */
export function validateNLCIUSRules(data: CanonicalInvoice): ValidationError[] {
  // Start with PEPPOL rules
  const errors = validatePeppolRules(data);

  // Dutch BTW (VAT ID) format validation
  const sellerVat = data.seller?.vatId?.trim();
  if (sellerVat && sellerVat.startsWith('NL') && !DUTCH_BTW_PATTERN.test(sellerVat)) {
    errors.push(
      createError(
        'NLCIUS-BTW-FORMAT',
        'invoice.seller.vatId',
        `Dutch VAT ID must match format NLxxxxxxxxxBxx, got "${sellerVat}"`,
        { suggestion: 'Format: NL + 9 digits + B + 2 digits (e.g. NL123456789B01)' },
      ),
    );
  }

  const buyerVat = data.buyer?.vatId?.trim();
  if (buyerVat && buyerVat.startsWith('NL') && !DUTCH_BTW_PATTERN.test(buyerVat)) {
    errors.push(
      createError(
        'NLCIUS-BTW-FORMAT',
        'invoice.buyer.vatId',
        `Dutch VAT ID must match format NLxxxxxxxxxBxx, got "${buyerVat}"`,
        { suggestion: 'Format: NL + 9 digits + B + 2 digits (e.g. NL123456789B01)' },
      ),
    );
  }

  // OIN / KVK endpoint validation
  errors.push(
    ...validateDutchEndpoint(
      data.seller?.electronicAddress,
      data.seller?.electronicAddressScheme,
      'Seller',
      'invoice.seller',
    ),
  );
  errors.push(
    ...validateDutchEndpoint(
      data.buyer?.electronicAddress,
      data.buyer?.electronicAddressScheme,
      'Buyer',
      'invoice.buyer',
    ),
  );

  return errors;
}
