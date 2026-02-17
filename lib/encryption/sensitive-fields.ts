/**
 * Sensitive Field Encryption Helpers
 *
 * Selectively encrypts/decrypts sensitive fields on a CanonicalInvoice
 * using envelope encryption. Fields are encrypted in-place and replaced
 * with their EncryptedField representation (JSON-stringified).
 *
 * @module lib/encryption/sensitive-fields
 */

import type { CanonicalInvoice } from '../../types/canonical-invoice';
import type { EncryptedField, EncryptionMetadata } from './types';
import { EncryptionError } from './types';
import { EnvelopeEncryption } from './envelope';

/**
 * Dot-notation paths to sensitive fields within CanonicalInvoice.
 * These fields contain PII or financial identifiers that require encryption at rest.
 */
export const SENSITIVE_FIELDS = [
  'seller.taxId',
  'seller.taxNumber',
  'seller.vatId',
  'seller.email',
  'buyer.taxId',
  'buyer.taxNumber',
  'buyer.vatId',
  'buyer.email',
  'payment.iban',
  'payment.bic',
] as const;

/** Flat field name aliases used in external APIs / config */
export const SENSITIVE_FIELD_ALIASES: readonly string[] = [
  'sellerTaxId',
  'buyerTaxId',
  'paymentIBAN',
  'paymentBIC',
  'sellerEmail',
  'buyerEmail',
];

type SensitiveFieldPath = (typeof SENSITIVE_FIELDS)[number];

/**
 * Resolve a dot-notation path to its value on an invoice object.
 *
 * @param invoice - The invoice object
 * @param path - Dot-notation field path (e.g. 'seller.email')
 * @returns The field value or undefined
 */
function getFieldValue(invoice: CanonicalInvoice, path: SensitiveFieldPath): string | null | undefined {
  const [section, field] = path.split('.') as [keyof CanonicalInvoice, string];
  const parent = invoice[section];
  if (parent && typeof parent === 'object' && field in parent) {
    return (parent as Record<string, unknown>)[field] as string | null | undefined;
  }
  return undefined;
}

/**
 * Set a dot-notation path value on an invoice object.
 *
 * @param invoice - The invoice object (mutated in place)
 * @param path - Dot-notation field path
 * @param value - Value to set
 */
function setFieldValue(invoice: CanonicalInvoice, path: SensitiveFieldPath, value: unknown): void {
  const [section, field] = path.split('.') as [keyof CanonicalInvoice, string];
  const parent = invoice[section];
  if (parent && typeof parent === 'object') {
    (parent as Record<string, unknown>)[field] = value;
  }
}

/**
 * Encrypt all sensitive fields on an invoice using the provided DEK.
 *
 * Replaces each sensitive field value with a JSON-stringified EncryptedField.
 * Fields that are null, undefined, or empty are skipped.
 *
 * @param invoice - The canonical invoice (will be mutated)
 * @param dek - 32-byte data encryption key
 * @returns EncryptionMetadata describing what was encrypted
 * @throws {EncryptionError} If encryption of any field fails
 */
export function encryptSensitiveFields(
  invoice: CanonicalInvoice,
  dek: Buffer,
): EncryptionMetadata {
  const encryptedFieldPaths: string[] = [];

  for (const path of SENSITIVE_FIELDS) {
    const value = getFieldValue(invoice, path);
    if (value == null || value === '') {
      continue;
    }

    try {
      const encrypted = EnvelopeEncryption.encryptField(value, dek);
      setFieldValue(invoice, path, JSON.stringify(encrypted));
      encryptedFieldPaths.push(path);
    } catch (error: unknown) {
      if (error instanceof EncryptionError) throw error;
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new EncryptionError('ENCRYPTION_FAILED', `Failed to encrypt field '${path}': ${message}`);
    }
  }

  return {
    encryptionKeyId: '', // Caller sets this after wrapping the DEK
    encryptedFields: encryptedFieldPaths,
    algorithm: 'aes-256-gcm',
    encryptedAt: new Date().toISOString(),
  };
}

/**
 * Decrypt all sensitive fields on an invoice using the provided DEK.
 *
 * Parses the JSON-stringified EncryptedField and restores the original plaintext.
 * Only fields listed in encryptedFields metadata are decrypted.
 *
 * @param invoice - The canonical invoice with encrypted fields (will be mutated)
 * @param dek - 32-byte data encryption key (must match encryption key)
 * @param encryptedFields - List of field paths that are encrypted
 * @throws {EncryptionError} If decryption of any field fails
 */
export function decryptSensitiveFields(
  invoice: CanonicalInvoice,
  dek: Buffer,
  encryptedFields: string[],
): void {
  for (const path of encryptedFields) {
    if (!SENSITIVE_FIELDS.includes(path as SensitiveFieldPath)) {
      continue;
    }

    const raw = getFieldValue(invoice, path as SensitiveFieldPath);
    if (raw == null) {
      continue;
    }

    try {
      const encrypted: EncryptedField = JSON.parse(raw);
      const plaintext = EnvelopeEncryption.decryptField(encrypted, dek);
      setFieldValue(invoice, path as SensitiveFieldPath, plaintext);
    } catch (error: unknown) {
      if (error instanceof EncryptionError) throw error;
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new EncryptionError('DECRYPTION_FAILED', `Failed to decrypt field '${path}': ${message}`);
    }
  }
}

/**
 * Mask a sensitive field value for display purposes.
 * Shows only the last 4 characters, replacing the rest with asterisks.
 *
 * @param value - The plaintext value to mask
 * @returns Masked string (e.g. "****5678") or "****" if value is too short
 */
export function maskField(value: string): string {
  if (!value || value.length <= 4) {
    return '****';
  }
  const visible = value.slice(-4);
  const masked = '*'.repeat(value.length - 4);
  return `${masked}${visible}`;
}
