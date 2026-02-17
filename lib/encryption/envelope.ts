/**
 * Envelope Encryption — AES-256-GCM
 *
 * Implements envelope encryption pattern: a random Data Encryption Key (DEK)
 * encrypts field data, then the DEK itself is wrapped by a Key Encryption Key (KEK).
 * This limits master-key exposure and allows per-record key rotation.
 *
 * Security notes:
 * - Uses 12-byte random IVs (NIST recommended for GCM)
 * - 128-bit auth tags for tamper detection
 * - Never logs plaintext or key material
 *
 * @module lib/encryption/envelope
 */

import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import type { EncryptedField } from './types';
import { EncryptionError } from './types';

/** AES-256-GCM constants */
const ALGORITHM = 'aes-256-gcm' as const;
const KEY_LENGTH_BYTES = 32; // 256 bits
const IV_LENGTH_BYTES = 12; // 96 bits — NIST recommended for GCM
const AUTH_TAG_LENGTH_BYTES = 16; // 128 bits

/**
 * Envelope encryption using AES-256-GCM.
 *
 * Provides field-level encryption with separate data keys (DEK) and
 * master-key wrapping (KEK) for defence-in-depth.
 */
export class EnvelopeEncryption {
  /**
   * Generate a random AES-256 data encryption key (DEK).
   *
   * @returns 32-byte Buffer suitable for AES-256-GCM
   */
  static generateDataKey(): Buffer {
    return randomBytes(KEY_LENGTH_BYTES);
  }

  /**
   * Encrypt a plaintext string with AES-256-GCM.
   *
   * @param plaintext - The string value to encrypt
   * @param dek - 32-byte data encryption key
   * @returns Encrypted field object with ciphertext, IV, and auth tag (all base64)
   * @throws {EncryptionError} If key length is invalid or encryption fails
   */
  static encryptField(plaintext: string, dek: Buffer): EncryptedField {
    EnvelopeEncryption.validateKeyLength(dek);

    try {
      const iv = randomBytes(IV_LENGTH_BYTES);
      const cipher = createCipheriv(ALGORITHM, dek, iv, {
        authTagLength: AUTH_TAG_LENGTH_BYTES,
      });

      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
      ]);

      const authTag = cipher.getAuthTag();

      return {
        ciphertext: encrypted.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
      };
    } catch (error: unknown) {
      if (error instanceof EncryptionError) throw error;
      const message = error instanceof Error ? error.message : 'Unknown encryption error';
      throw new EncryptionError('ENCRYPTION_FAILED', `Field encryption failed: ${message}`);
    }
  }

  /**
   * Decrypt an AES-256-GCM encrypted field.
   *
   * @param encrypted - The encrypted field (ciphertext, IV, auth tag in base64)
   * @param dek - 32-byte data encryption key (must match the key used for encryption)
   * @returns Decrypted plaintext string
   * @throws {EncryptionError} If key is wrong, data is tampered, or decryption fails
   */
  static decryptField(encrypted: EncryptedField, dek: Buffer): string {
    EnvelopeEncryption.validateKeyLength(dek);

    try {
      const iv = Buffer.from(encrypted.iv, 'base64');
      const authTag = Buffer.from(encrypted.authTag, 'base64');
      const ciphertext = Buffer.from(encrypted.ciphertext, 'base64');

      const decipher = createDecipheriv(ALGORITHM, dek, iv, {
        authTagLength: AUTH_TAG_LENGTH_BYTES,
      });
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } catch (error: unknown) {
      if (error instanceof EncryptionError) throw error;
      const message = error instanceof Error ? error.message : 'Unknown decryption error';
      throw new EncryptionError('DECRYPTION_FAILED', `Field decryption failed: ${message}`);
    }
  }

  /**
   * Wrap (encrypt) a DEK with a master key (KEK) using AES-256-GCM.
   *
   * @param dek - The data encryption key to wrap
   * @param masterKey - 32-byte key encryption key
   * @returns Wrapped key bundle (ciphertext, IV, auth tag in base64)
   * @throws {EncryptionError} If key wrapping fails
   */
  static wrapKey(dek: Buffer, masterKey: Buffer): EncryptedField {
    EnvelopeEncryption.validateKeyLength(masterKey);

    try {
      const iv = randomBytes(IV_LENGTH_BYTES);
      const cipher = createCipheriv(ALGORITHM, masterKey, iv, {
        authTagLength: AUTH_TAG_LENGTH_BYTES,
      });

      const wrapped = Buffer.concat([
        cipher.update(dek),
        cipher.final(),
      ]);

      return {
        ciphertext: wrapped.toString('base64'),
        iv: iv.toString('base64'),
        authTag: cipher.getAuthTag().toString('base64'),
      };
    } catch (error: unknown) {
      if (error instanceof EncryptionError) throw error;
      const message = error instanceof Error ? error.message : 'Unknown key wrap error';
      throw new EncryptionError('KEY_WRAP_FAILED', `Key wrapping failed: ${message}`);
    }
  }

  /**
   * Unwrap (decrypt) a wrapped DEK using the master key (KEK).
   *
   * @param wrappedDek - The wrapped key bundle
   * @param masterKey - 32-byte key encryption key
   * @returns The unwrapped DEK as a Buffer
   * @throws {EncryptionError} If key unwrapping fails (wrong KEK or tampered)
   */
  static unwrapKey(wrappedDek: EncryptedField, masterKey: Buffer): Buffer {
    EnvelopeEncryption.validateKeyLength(masterKey);

    try {
      const iv = Buffer.from(wrappedDek.iv, 'base64');
      const authTag = Buffer.from(wrappedDek.authTag, 'base64');
      const ciphertext = Buffer.from(wrappedDek.ciphertext, 'base64');

      const decipher = createDecipheriv(ALGORITHM, masterKey, iv, {
        authTagLength: AUTH_TAG_LENGTH_BYTES,
      });
      decipher.setAuthTag(authTag);

      return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);
    } catch (error: unknown) {
      if (error instanceof EncryptionError) throw error;
      const message = error instanceof Error ? error.message : 'Unknown key unwrap error';
      throw new EncryptionError('KEY_UNWRAP_FAILED', `Key unwrapping failed: ${message}`);
    }
  }

  /**
   * Validate that a key is exactly 32 bytes (256 bits).
   *
   * @param key - Buffer to validate
   * @throws {EncryptionError} If key length is not 32 bytes
   */
  private static validateKeyLength(key: Buffer): void {
    if (!Buffer.isBuffer(key) || key.length !== KEY_LENGTH_BYTES) {
      throw new EncryptionError(
        'INVALID_KEY_LENGTH',
        `Key must be exactly ${KEY_LENGTH_BYTES} bytes (${KEY_LENGTH_BYTES * 8} bits), got ${Buffer.isBuffer(key) ? key.length : 'non-buffer'}`,
      );
    }
  }
}
