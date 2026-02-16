/**
 * XRechnung 3.0 profile-specific validation rules (BR-DE).
 * Implements German-specific business rules for XRechnung compliance.
 */

import type { CanonicalInvoice } from '@/types/canonical-invoice';
import { createError, createWarning, type ValidationError } from './validation-result';

/**
 * Run all BR-DE profile rules for XRechnung 3.0 CII.
 */
export function validateXRechnungRules(data: CanonicalInvoice): ValidationError[] {
  const errors: ValidationError[] = [];

  // BR-DE-1: Seller address street is required
  if (!data.seller?.address?.trim()) {
    errors.push(
      createError(
        'BR-DE-1',
        'invoice.seller.address',
        'Seller street address is required (BR-DE-1)'
      )
    );
  }

  // BR-DE-2: Seller contact is MANDATORY (PersonName + Phone + Email)
  const hasContactName = !!(data.seller?.contactName || data.seller?.name);
  const hasPhone = !!data.seller?.phone;
  const hasEmail = !!data.seller?.email;

  if (!hasContactName || !hasPhone || !hasEmail) {
    const missing: string[] = [];
    if (!hasContactName) missing.push('contact name');
    if (!hasPhone) missing.push('phone number');
    if (!hasEmail) missing.push('email address');
    errors.push(
      createError(
        'BR-DE-2',
        'invoice.seller.contact',
        `Seller contact information is incomplete: missing ${missing.join(', ')} (BR-DE-2)`,
        { suggestion: 'Provide seller contact name, phone number, and email address' }
      )
    );
  }

  // BR-DE-3: Seller city is required
  if (!data.seller?.city?.trim()) {
    errors.push(createError('BR-DE-3', 'invoice.seller.city', 'Seller city is required (BR-DE-3)'));
  }

  // BR-DE-4: Seller postal code is required
  if (!data.seller?.postalCode?.trim()) {
    errors.push(
      createError(
        'BR-DE-4',
        'invoice.seller.postalCode',
        'Seller postal code is required (BR-DE-4)'
      )
    );
  }

  // BR-DE-5/9: Seller country code is required
  if (!data.seller?.countryCode?.trim()) {
    errors.push(
      createError(
        'BR-DE-5',
        'invoice.seller.countryCode',
        'Seller country code is required (BR-DE-5/9)'
      )
    );
  }

  // BR-DE-6: Buyer address street is required
  if (!data.buyer?.address?.trim()) {
    errors.push(
      createError(
        'BR-DE-6',
        'invoice.buyer.address',
        'Buyer street address is required for XRechnung (BR-DE-6)',
        { suggestion: 'Provide the buyer street address (e.g. "Musterstraße 1")' }
      )
    );
  }

  // BR-DE-7: Buyer city is required
  if (!data.buyer?.city?.trim()) {
    errors.push(
      createError(
        'BR-DE-7',
        'invoice.buyer.city',
        'Buyer city is required for XRechnung (BR-DE-7)',
        { suggestion: 'Provide the buyer city name (e.g. "Berlin")' }
      )
    );
  }

  // BR-DE-8: Buyer postal code is required
  if (!data.buyer?.postalCode?.trim()) {
    errors.push(
      createError(
        'BR-DE-8',
        'invoice.buyer.postalCode',
        'Buyer postal code is required for XRechnung (BR-DE-8)',
        { suggestion: 'Provide the buyer postal code (e.g. "10115")' }
      )
    );
  }

  // BR-DE-9/11: Buyer country code is required
  if (!data.buyer?.countryCode?.trim()) {
    errors.push(
      createError(
        'BR-DE-11',
        'invoice.buyer.countryCode',
        'Buyer country code is required (BR-DE-11)',
        { suggestion: 'Provide a 2-letter country code (e.g. "DE" for Germany)' }
      )
    );
  }

  // BR-DE-15: Buyer reference (Leitweg-ID) is required for XRechnung
  if (!data.buyerReference?.trim() && !data.invoiceNumber?.trim()) {
    errors.push(
      createWarning(
        'BR-DE-15',
        'invoice.buyerReference',
        'Buyer reference (Leitweg-ID) should be provided for XRechnung (BR-DE-15)',
        {
          suggestion:
            'Invoice number is used as fallback, but a proper Leitweg-ID is recommended for public sector invoices',
        }
      )
    );
  }

  // BR-CO-26 / BR-S-02 / BR-DE-16: Seller tax identifier is required
  const hasSellerVatId = !!(data.seller?.vatId?.trim());
  const hasSellerTaxNumber = !!(data.seller?.taxNumber?.trim());
  const hasSellerTaxId = !!(data.seller?.taxId?.trim());
  const hasAnySellerTaxIdentifier = hasSellerVatId || hasSellerTaxNumber || hasSellerTaxId;

  if (!hasAnySellerTaxIdentifier) {
    errors.push(
      createError(
        'BR-CO-26',
        'invoice.seller.taxIdentifier',
        'At least one seller tax identifier is required: VAT ID (BT-31), tax registration number (BT-32), or tax representative VAT ID (BT-63) (BR-CO-26 / BR-S-02 / BR-DE-16)',
        {
          suggestion: 'Provide either the seller USt-IdNr. (e.g. "DE123456789") or Steuernummer (e.g. "12/345/67890")',
        }
      )
    );
  }

  // BR-DE-18: Invoice currency must be EUR for XRechnung
  const currency = data.currency?.toString().toUpperCase().trim() || 'EUR';
  if (currency !== 'EUR') {
    errors.push(
      createError(
        'BR-DE-18',
        'invoice.currency',
        `XRechnung requires EUR as the invoice currency (BR-DE-18). Current currency: "${currency}"`,
        { suggestion: 'Change the invoice currency to EUR (Euro)', expected: 'EUR', actual: currency }
      )
    );
  }

  // BR-DE-23-a: When payment means is 58 (SEPA CT), IBAN is MANDATORY
  const iban = data.payment?.iban?.trim();
  if (!iban) {
    errors.push(
      createError(
        'BR-DE-23-a',
        'invoice.seller.iban',
        'Seller IBAN is required for SEPA credit transfer (TypeCode 58) (BR-DE-23-a)',
        { suggestion: 'Provide the seller IBAN or change payment means type' }
      )
    );
  }

  // P0-5: Buyer electronic address (BT-49) is required for XRechnung
  if (!data.buyer?.electronicAddress?.trim()) {
    errors.push(
      createError(
        'PEPPOL-EN16931-R010',
        'invoice.buyer.electronicAddress',
        'Buyer electronic address (BT-49) is required for XRechnung',
        { suggestion: 'Provide buyer electronic address (e.g. email)' }
      )
    );
  }

  // P0-6: Seller electronic address (BT-34) is required for XRechnung
  if (!data.seller?.electronicAddress?.trim()) {
    errors.push(
      createError(
        'BR-DE-SELLER-EADDR',
        'invoice.seller.electronicAddress',
        'Seller electronic address (BT-34) is required for XRechnung',
        { suggestion: 'Provide seller electronic address (e.g. email)' }
      )
    );
  }

  // BG-3 / BT-25: Preceding invoice reference is MANDATORY for credit notes (TypeCode 381)
  const docType = data.documentTypeCode ?? 380;
  if (docType === 381 && !data.precedingInvoiceReference?.trim()) {
    errors.push(
      createError(
        'BR-55',
        'invoice.precedingInvoiceReference',
        'Credit notes (TypeCode 381) must include a preceding invoice reference (BT-25)',
        { suggestion: 'Provide the original invoice number that this credit note relates to' }
      )
    );
  }

  // BR-CO-25: Payment terms or due date
  if (!data.payment?.paymentTerms?.trim() && !data.payment?.dueDate?.trim()) {
    errors.push(
      createError(
        'BR-CO-25',
        'invoice.payment',
        'Either payment terms or payment due date is required (BR-CO-25)'
      )
    );
  }

  return errors;
}
