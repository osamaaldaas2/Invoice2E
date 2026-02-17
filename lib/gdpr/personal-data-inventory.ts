/**
 * Personal Data Inventory
 *
 * Maps all tables/fields containing PII across the Invoice2E system.
 * Required for GDPR compliance — enables systematic identification
 * of personal data for access, erasure, and portability requests.
 *
 * Intent: Centralize PII field knowledge so GDPR operations never miss a field.
 *
 * @module lib/gdpr/personal-data-inventory
 */

import type { PersonalDataInventory, EntityPiiMapping } from './types';

/**
 * Complete inventory of personal data fields across all entities.
 * Must be updated whenever new PII-containing fields are added to the schema.
 */
export const PERSONAL_DATA_INVENTORY: PersonalDataInventory = {
  users: {
    entity: 'users',
    fields: [
      'email',
      'first_name',
      'last_name',
      'address_line_1',
      'address_line_2',
      'city',
      'postal_code',
      'country',
      'phone',
      'tax_id',
    ],
    description: 'User profile — identity, contact, and address data',
  },
  invoice_extractions: {
    entity: 'invoice_extractions',
    fields: [
      'extraction_data',
    ],
    description:
      'Extracted invoice data — contains seller/buyer names, addresses, tax IDs, IBANs, emails embedded in extraction_data JSON',
  },
  invoice_conversions: {
    entity: 'invoice_conversions',
    fields: [
      'buyer_name',
      'email_recipient',
    ],
    description: 'Invoice conversions — buyer name and email recipient',
  },
  payment_transactions: {
    entity: 'payment_transactions',
    fields: [
      'stripe_payment_id',
    ],
    description: 'Payment transactions — linked to external payment provider identity',
  },
  audit_logs: {
    entity: 'audit_logs',
    fields: [
      'user_id',
      'ip_address',
      'user_agent',
      'changes',
    ],
    description: 'Audit logs — user references, IP addresses, and change history',
  },
};

/**
 * PII fields within the extraction_data JSON blob.
 * These are dot-notation paths into the ExtractedInvoiceData structure.
 */
export const EXTRACTION_DATA_PII_FIELDS: readonly string[] = [
  'sellerName',
  'sellerEmail',
  'sellerAddress',
  'sellerCity',
  'sellerPostalCode',
  'sellerTaxId',
  'sellerVatId',
  'sellerTaxNumber',
  'sellerIban',
  'sellerBic',
  'sellerPhone',
  'sellerContactName',
  'sellerElectronicAddress',
  'buyerName',
  'buyerEmail',
  'buyerAddress',
  'buyerCity',
  'buyerPostalCode',
  'buyerTaxId',
  'buyerVatId',
  'buyerPhone',
  'buyerElectronicAddress',
] as const;

/**
 * Check whether a given table + field combination contains personal data.
 *
 * @param table - Database table name
 * @param field - Column/field name
 * @returns true if the field is classified as PII
 */
export function isPersonalData(table: string, field: string): boolean {
  const entity = PERSONAL_DATA_INVENTORY[table];
  if (!entity) {
    return false;
  }
  return entity.fields.includes(field);
}

/**
 * Get the PII mapping for a specific entity.
 *
 * @param table - Database table name
 * @returns The entity PII mapping or undefined
 */
export function getEntityPiiMapping(table: string): EntityPiiMapping | undefined {
  return PERSONAL_DATA_INVENTORY[table];
}

/**
 * Get all entity names that contain personal data.
 *
 * @returns Array of table names containing PII
 */
export function getAllPiiEntities(): string[] {
  return Object.keys(PERSONAL_DATA_INVENTORY);
}
