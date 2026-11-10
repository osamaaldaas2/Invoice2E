import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptExtractionData, decryptExtractionData } from '@/lib/encryption/extraction';

describe('Persisted extraction encryption', () => {
  beforeEach(() => {
    vi.stubEnv(
      'FIELD_ENCRYPTION_KEYS',
      JSON.stringify({ old: '11'.repeat(32), current: '22'.repeat(32) })
    );
    vi.stubEnv('FIELD_ENCRYPTION_ACTIVE_KEY', 'old');
  });
  afterEach(() => vi.unstubAllEnvs());
  it('roundtrips flat, canonical and snapshot fields after serialization and key rotation', () => {
    const input = {
      seller_tax_id: 'SECRET1',
      buyerEmail: 'SECRET2',
      seller: { vat_id: 'SECRET3' },
      original: { payment: { iban: 'SECRET4' } },
      amount: 100,
    };
    const stored = JSON.parse(JSON.stringify(encryptExtractionData(input)));
    for (const secret of ['SECRET1', 'SECRET2', 'SECRET3', 'SECRET4'])
      expect(JSON.stringify(stored)).not.toContain(secret);
    vi.stubEnv('FIELD_ENCRYPTION_ACTIVE_KEY', 'current');
    expect(decryptExtractionData(stored)).toEqual(input);
    expect(input.seller_tax_id).toBe('SECRET1');
  });
  it('fails closed when the historical key is unavailable', () => {
    const stored = encryptExtractionData({ iban: 'secret' });
    vi.stubEnv('FIELD_ENCRYPTION_KEYS', '{}');
    expect(() => decryptExtractionData(stored)).toThrow();
  });
  it('rejects tampering with an encrypted field', () => {
    const stored = encryptExtractionData({ iban: 'secret' });
    stored.iban = 'plaintext replacement';
    expect(() => decryptExtractionData(stored)).toThrow();
  });
});
