/**
 * Envelope Encryption Tests
 *
 * Covers: roundtrip encrypt/decrypt, wrong-key rejection, tamper detection,
 * key wrap/unwrap, sensitive field helpers, and masking.
 */

import { randomBytes } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { EnvelopeEncryption } from './envelope';
import { encryptSensitiveFields, decryptSensitiveFields, maskField } from './sensitive-fields';
import { EncryptionError } from './types';
import type { CanonicalInvoice } from '../../types/canonical-invoice';

describe('EnvelopeEncryption', () => {
  const dek = EnvelopeEncryption.generateDataKey();

  describe('generateDataKey', () => {
    it('should generate a 32-byte key', () => {
      const key = EnvelopeEncryption.generateDataKey();
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });

    it('should generate unique keys', () => {
      const key1 = EnvelopeEncryption.generateDataKey();
      const key2 = EnvelopeEncryption.generateDataKey();
      expect(key1.equals(key2)).toBe(false);
    });
  });

  describe('encryptField / decryptField', () => {
    it('should roundtrip encrypt and decrypt a plaintext string', () => {
      const plaintext = 'DE89370400440532013000';
      const encrypted = EnvelopeEncryption.encryptField(plaintext, dek);

      expect(encrypted.ciphertext).toBeTruthy();
      expect(encrypted.iv).toBeTruthy();
      expect(encrypted.authTag).toBeTruthy();
      expect(encrypted.ciphertext).not.toBe(plaintext);

      const decrypted = EnvelopeEncryption.decryptField(encrypted, dek);
      expect(decrypted).toBe(plaintext);
    });

    it('should roundtrip unicode content', () => {
      const plaintext = 'Ünternehmen GmbH — Steuernr. 123/456/789 🏦';
      const encrypted = EnvelopeEncryption.encryptField(plaintext, dek);
      const decrypted = EnvelopeEncryption.decryptField(encrypted, dek);
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertexts for the same plaintext (random IV)', () => {
      const plaintext = 'same-value';
      const a = EnvelopeEncryption.encryptField(plaintext, dek);
      const b = EnvelopeEncryption.encryptField(plaintext, dek);
      expect(a.ciphertext).not.toBe(b.ciphertext);
    });

    it('should fail decryption with wrong key', () => {
      const plaintext = 'secret-iban';
      const encrypted = EnvelopeEncryption.encryptField(plaintext, dek);
      const wrongKey = EnvelopeEncryption.generateDataKey();

      expect(() => EnvelopeEncryption.decryptField(encrypted, wrongKey))
        .toThrow(EncryptionError);
    });

    it('should detect tampered ciphertext via auth tag', () => {
      const plaintext = 'tamper-test';
      const encrypted = EnvelopeEncryption.encryptField(plaintext, dek);

      // Flip a byte in the ciphertext
      const buf = Buffer.from(encrypted.ciphertext, 'base64');
      buf[0] ^= 0xff;
      const tampered = { ...encrypted, ciphertext: buf.toString('base64') };

      expect(() => EnvelopeEncryption.decryptField(tampered, dek))
        .toThrow(EncryptionError);
    });

    it('should detect tampered auth tag', () => {
      const encrypted = EnvelopeEncryption.encryptField('auth-tag-test', dek);

      const buf = Buffer.from(encrypted.authTag, 'base64');
      buf[0] ^= 0xff;
      const tampered = { ...encrypted, authTag: buf.toString('base64') };

      expect(() => EnvelopeEncryption.decryptField(tampered, dek))
        .toThrow(EncryptionError);
    });

    it('should reject invalid key length', () => {
      const shortKey = randomBytes(16);
      expect(() => EnvelopeEncryption.encryptField('test', shortKey))
        .toThrow(EncryptionError);
    });
  });

  describe('wrapKey / unwrapKey', () => {
    it('should roundtrip wrap and unwrap a DEK', () => {
      const masterKey = EnvelopeEncryption.generateDataKey();
      const wrapped = EnvelopeEncryption.wrapKey(dek, masterKey);
      const unwrapped = EnvelopeEncryption.unwrapKey(wrapped, masterKey);
      expect(unwrapped.equals(dek)).toBe(true);
    });

    it('should fail unwrap with wrong master key', () => {
      const masterKey = EnvelopeEncryption.generateDataKey();
      const wrongMaster = EnvelopeEncryption.generateDataKey();
      const wrapped = EnvelopeEncryption.wrapKey(dek, masterKey);

      expect(() => EnvelopeEncryption.unwrapKey(wrapped, wrongMaster))
        .toThrow(EncryptionError);
    });
  });
});

describe('Sensitive Fields', () => {
  function makeInvoice(overrides?: Partial<CanonicalInvoice>): CanonicalInvoice {
    return {
      outputFormat: 'xrechnung-ubl',
      invoiceNumber: 'INV-001',
      invoiceDate: '2026-01-15',
      currency: 'EUR',
      seller: {
        name: 'Seller GmbH',
        email: 'seller@example.com',
        taxId: 'DE123456789',
        taxNumber: '123/456/78901',
        vatId: 'DE123456789',
      },
      buyer: {
        name: 'Buyer AG',
        email: 'buyer@example.com',
        taxId: 'DE987654321',
      },
      payment: {
        iban: 'DE89370400440532013000',
        bic: 'COBADEFFXXX',
      },
      lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100, totalPrice: 100 }],
      totals: { subtotal: 100, taxAmount: 19, totalAmount: 119 },
      ...overrides,
    };
  }

  it('should encrypt and decrypt sensitive fields roundtrip', () => {
    const dek = EnvelopeEncryption.generateDataKey();
    const invoice = makeInvoice();
    const originalIban = invoice.payment.iban;

    const metadata = encryptSensitiveFields(invoice, dek);

    // Fields should now be JSON-stringified EncryptedField
    expect(invoice.payment.iban).not.toBe(originalIban);
    expect(metadata.encryptedFields).toContain('payment.iban');
    expect(metadata.algorithm).toBe('aes-256-gcm');

    // Decrypt
    decryptSensitiveFields(invoice, dek, metadata.encryptedFields);
    expect(invoice.payment.iban).toBe(originalIban);
    expect(invoice.seller.email).toBe('seller@example.com');
  });

  it('should skip null/undefined fields', () => {
    const dek = EnvelopeEncryption.generateDataKey();
    const invoice = makeInvoice();
    invoice.buyer.email = undefined;
    invoice.buyer.taxNumber = null;

    const metadata = encryptSensitiveFields(invoice, dek);
    expect(metadata.encryptedFields).not.toContain('buyer.email');
    expect(metadata.encryptedFields).not.toContain('buyer.taxNumber');
  });
});

describe('maskField', () => {
  it('should mask all but last 4 characters', () => {
    expect(maskField('DE89370400440532013000')).toBe('******************3000');
  });

  it('should return **** for short values', () => {
    expect(maskField('AB')).toBe('****');
    expect(maskField('')).toBe('****');
  });

  it('should handle exactly 4 characters', () => {
    expect(maskField('ABCD')).toBe('****');
  });

  it('should handle 5 characters', () => {
    expect(maskField('ABCDE')).toBe('*BCDE');
  });
});
