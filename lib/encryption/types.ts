/**
 * Envelope Encryption Type Definitions
 *
 * Types for AES-256-GCM envelope encryption of sensitive invoice fields.
 * Used by EnvelopeEncryption and sensitive field helpers.
 *
 * @module lib/encryption/types
 */

/** Result of encrypting a single field with AES-256-GCM */
export interface EncryptedField {
  /** Base64-encoded ciphertext */
  ciphertext: string;
  /** Base64-encoded initialization vector (12 bytes) */
  iv: string;
  /** Base64-encoded authentication tag (16 bytes) */
  authTag: string;
}

/** A data encryption key (DEK) wrapped by a key encryption key (KEK) */
export interface DataKeyBundle {
  /** Base64-encoded wrapped (encrypted) DEK */
  wrappedKey: string;
  /** Base64-encoded IV used to wrap the DEK */
  iv: string;
  /** Base64-encoded auth tag from wrapping */
  authTag: string;
  /** Identifier of the KEK used for wrapping */
  keyId: string;
}

/** Metadata stored alongside an encrypted invoice record */
export interface EncryptionMetadata {
  /** Unique identifier for the encryption key bundle */
  encryptionKeyId: string;
  /** List of field paths that are encrypted */
  encryptedFields: string[];
  /** Encryption algorithm used */
  algorithm: 'aes-256-gcm';
  /** ISO 8601 timestamp of when encryption was performed */
  encryptedAt: string;
}

/** Error codes specific to encryption operations */
export type EncryptionErrorCode =
  | 'ENCRYPTION_FAILED'
  | 'DECRYPTION_FAILED'
  | 'KEY_WRAP_FAILED'
  | 'KEY_UNWRAP_FAILED'
  | 'INVALID_KEY_LENGTH'
  | 'TAMPERED_DATA';

/** Custom error for encryption operations */
export class EncryptionError extends Error {
  public readonly code: EncryptionErrorCode;

  constructor(code: EncryptionErrorCode, message: string) {
    super(message);
    this.name = 'EncryptionError';
    this.code = code;
  }
}
