/**
 * Factur-X profile-specific validation rules.
 * Supports EN 16931 (full) and BASIC (reduced) profiles.
 * Does NOT include German BR-DE rules or PEPPOL-specific rules.
 */

import type { CanonicalInvoice } from '@/types/canonical-invoice';
import { createError, type ValidationError } from './validation-result';

/** EN 16931 tax category codes */
const EN16931_TAX_CATEGORIES = new Set(['S', 'Z', 'E', 'AE', 'K', 'G', 'O', 'L', 'M']);

/** ISO 3166-1 alpha-2 country code pattern */
const ISO_COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

/** ISO 4217 currency code pattern (3 uppercase letters) */
const ISO_4217_PATTERN = /^[A-Z]{3}$/;

/**
 * Run Factur-X validation rules.
 * @param data - Canonical invoice data
 * @param profile - 'en16931' for full EN 16931 profile, 'basic' for reduced BASIC profile
 */
export function validateFacturXRules(
  data: CanonicalInvoice,
  profile: 'en16931' | 'basic'
): ValidationError[] {
  const errors: ValidationError[] = [];

  // === Common Factur-X rules ===

  // Document type must be 380 (invoice) or 381 (credit note)
  const docType = data.documentTypeCode ?? 380;
  if (docType !== 380 && docType !== 381) {
    errors.push(
      createError(
        'FX-COMMON-001',
        'invoice.documentTypeCode',
        `Document type code must be 380 (invoice) or 381 (credit note), got "${docType}"`,
        { actual: String(docType), suggestion: 'Use 380 for invoices or 381 for credit notes' }
      )
    );
  }

  // At least one line item required
  const items = data.lineItems || [];
  if (items.length === 0) {
    errors.push(
      createError(
        'FX-COMMON-002',
        'invoice.lineItems',
        'At least one line item is required'
      )
    );
  }

  // Seller name mandatory
  if (!data.seller?.name?.trim()) {
    errors.push(
      createError(
        'FX-COMMON-003',
        'invoice.seller.name',
        'Seller name is required for Factur-X'
      )
    );
  }

  // Seller address mandatory
  if (!data.seller?.address?.trim()) {
    errors.push(
      createError(
        'FX-COMMON-004',
        'invoice.seller.address',
        'Seller address is required for Factur-X'
      )
    );
  }

  // Buyer name mandatory
  if (!data.buyer?.name?.trim()) {
    errors.push(
      createError(
        'FX-COMMON-005',
        'invoice.buyer.name',
        'Buyer name is required for Factur-X'
      )
    );
  }

  // Seller country code required
  const sellerCountry = data.seller?.countryCode?.trim();
  if (!sellerCountry) {
    errors.push(
      createError(
        'FX-COMMON-006',
        'invoice.seller.countryCode',
        'Seller country code is required for Factur-X'
      )
    );
  } else if (!ISO_COUNTRY_CODE_PATTERN.test(sellerCountry)) {
    errors.push(
      createError(
        'FX-COMMON-006a',
        'invoice.seller.countryCode',
        `Seller country code "${sellerCountry}" is not a valid ISO 3166-1 alpha-2 code`,
        { actual: sellerCountry }
      )
    );
  }

  // Buyer country code required
  const buyerCountry = data.buyer?.countryCode?.trim();
  if (!buyerCountry) {
    errors.push(
      createError(
        'FX-COMMON-007',
        'invoice.buyer.countryCode',
        'Buyer country code is required for Factur-X'
      )
    );
  } else if (!ISO_COUNTRY_CODE_PATTERN.test(buyerCountry)) {
    errors.push(
      createError(
        'FX-COMMON-007a',
        'invoice.buyer.countryCode',
        `Buyer country code "${buyerCountry}" is not a valid ISO 3166-1 alpha-2 code`,
        { actual: buyerCountry }
      )
    );
  }

  // Currency must be valid ISO 4217
  const currency = data.currency?.toString().toUpperCase().trim();
  if (currency && !ISO_4217_PATTERN.test(currency)) {
    errors.push(
      createError(
        'FX-COMMON-008',
        'invoice.currency',
        `Currency "${currency}" is not a valid ISO 4217 code`,
        { actual: currency, suggestion: 'Use a 3-letter ISO 4217 currency code (e.g. "EUR", "USD")' }
      )
    );
  }

  // Tax category validation on line items
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const taxCat = item.taxCategoryCode?.trim();
    if (taxCat && !EN16931_TAX_CATEGORIES.has(taxCat)) {
      errors.push(
        createError(
          'FX-COMMON-009',
          `invoice.lineItems[${i}].taxCategoryCode`,
          `Tax category code "${taxCat}" is not in the EN 16931 allowed set (${[...EN16931_TAX_CATEGORIES].join(', ')})`,
          { actual: taxCat }
        )
      );
    }
  }

  // Credit note must reference preceding invoice
  if (docType === 381 && !data.precedingInvoiceReference?.trim()) {
    errors.push(
      createError(
        'FX-COMMON-010',
        'invoice.precedingInvoiceReference',
        'Credit notes (TypeCode 381) must include a preceding invoice reference (BT-25)',
        { suggestion: 'Provide the original invoice number this credit note relates to' }
      )
    );
  }

  // Seller tax identifier required
  const hasAnyTaxId = !!(
    data.seller?.vatId?.trim() ||
    data.seller?.taxNumber?.trim() ||
    data.seller?.taxId?.trim()
  );
  if (!hasAnyTaxId) {
    errors.push(
      createError(
        'FX-COMMON-011',
        'invoice.seller.taxIdentifier',
        'At least one seller tax identifier is required (VAT ID, tax number, or tax representative VAT ID)',
        { suggestion: 'Provide seller VAT ID or tax registration number' }
      )
    );
  }

  // === Profile-specific rules ===

  if (profile === 'en16931') {
    // EN 16931 profile: full rules — payment terms or due date required
    if (!data.payment?.paymentTerms?.trim() && !data.payment?.dueDate?.trim()) {
      errors.push(
        createError(
          'FX-EN16931-001',
          'invoice.payment',
          'Either payment terms or payment due date is required for Factur-X EN 16931 profile'
        )
      );
    }
  }

  // BASIC profile: no additional mandatory fields beyond common rules
  // (no line-level allowances required, no BillingReference required,
  //  simpler payment info — just payment means code is sufficient)

  return errors;
}
