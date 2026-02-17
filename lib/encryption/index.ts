/**
 * Envelope Encryption — barrel export
 *
 * @module lib/encryption
 */

export { EnvelopeEncryption } from './envelope';
export {
  SENSITIVE_FIELDS,
  SENSITIVE_FIELD_ALIASES,
  encryptSensitiveFields,
  decryptSensitiveFields,
  maskField,
} from './sensitive-fields';
export type {
  EncryptedField,
  DataKeyBundle,
  EncryptionMetadata,
  EncryptionErrorCode,
} from './types';
export { EncryptionError } from './types';
