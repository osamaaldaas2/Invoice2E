/**
 * XRechnung 3.0 profile-specific validation rules (BR-DE).
 * Implements German-specific business rules for XRechnung compliance.
 */

import type { XRechnungInvoiceData } from '@/services/xrechnung/types';
import { createError, createWarning, type ValidationError } from './validation-result';

/**
 * Run all BR-DE profile rules for XRechnung 3.0 CII.
 */
export function validateXRechnungRules(data: XRechnungInvoiceData): ValidationError[] {
  const errors: ValidationError[] = [];

  // BR-DE-1: Seller address street is required
  if (!data.sellerAddress?.trim()) {
    errors.push(
      createError(
        'BR-DE-1',
        'invoice.seller.address',
        'Seller street address is required (BR-DE-1)'
      )
    );
  }

  // BR-DE-2: Seller contact is MANDATORY (PersonName + Phone + Email)
  const hasContactName = !!(data.sellerContactName || data.sellerContact || data.sellerName);
  const hasPhone = !!(data.sellerPhoneNumber || data.sellerPhone);
  const hasEmail = !!data.sellerEmail;

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
  if (!data.sellerCity?.trim()) {
    errors.push(createError('BR-DE-3', 'invoice.seller.city', 'Seller city is required (BR-DE-3)'));
  }

  // BR-DE-4: Seller postal code is required
  if (!data.sellerPostalCode?.trim()) {
    errors.push(
      createError(
        'BR-DE-4',
        'invoice.seller.postalCode',
        'Seller postal code is required (BR-DE-4)'
      )
    );
  }

  // BR-DE-5/9: Seller country code is required
  if (!data.sellerCountryCode?.trim()) {
    errors.push(
      createError(
        'BR-DE-5',
        'invoice.seller.countryCode',
        'Seller country code is required (BR-DE-5/9)'
      )
    );
  }

  // BR-DE-11: Buyer country code is required
  if (!data.buyerCountryCode?.trim()) {
    errors.push(
      createError(
        'BR-DE-11',
        'invoice.buyer.countryCode',
        'Buyer country code is required (BR-DE-11)'
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

  // BR-DE-17: Payment means type code must be an accepted value
  // (Validated during XML generation; skip here as we derive from IBAN presence)

  // BR-DE-23-a: When payment means is 58 (SEPA CT), IBAN is MANDATORY
  const iban = data.sellerIban?.trim();
  if (!iban) {
    // If IBAN is missing and no explicit payment means code, this is a blocking error
    // because the default TypeCode is 58 (SEPA credit transfer)
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
  if (!data.buyerElectronicAddress?.trim()) {
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
  if (!data.sellerElectronicAddress?.trim()) {
    errors.push(
      createError(
        'BR-DE-SELLER-EADDR',
        'invoice.seller.electronicAddress',
        'Seller electronic address (BT-34) is required for XRechnung',
        { suggestion: 'Provide seller electronic address (e.g. email)' }
      )
    );
  }

  // BR-CO-25: Payment terms or due date
  if (!data.paymentTerms?.trim() && !data.paymentDueDate?.trim() && !data.dueDate?.trim()) {
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
