import { randomBytes } from 'crypto';
import { EnvelopeEncryption } from './envelope';
import type { EncryptedField } from './types';

const META = '_field_encryption';
const PREFIX = 'enc:v1:';
type Metadata = { key_id: string; wrapped_key: EncryptedField; paths: string[][] };

function masterKey(id: string): Buffer {
  const keys = JSON.parse(process.env.FIELD_ENCRYPTION_KEYS || '{}') as Record<string, string>;
  const hex = keys[id];
  if (!hex || !/^[a-f0-9]{64}$/i.test(hex))
    throw new Error('Field encryption key is missing or invalid');
  return Buffer.from(hex, 'hex');
}

function sensitive(key: string): boolean {
  return /^(?:(?:seller|buyer|payment))?(?:email|taxid|taxnumber|vatid|iban|bic)$/i.test(
    key.replace(/_/g, '')
  );
}

/** Encrypt both canonical and flat fields, including snapshots. Never mutate callers. */
export function encryptExtractionData(data: Record<string, unknown>): Record<string, unknown> {
  const keyId = process.env.FIELD_ENCRYPTION_ACTIVE_KEY;
  if (!keyId) throw new Error('FIELD_ENCRYPTION_ACTIVE_KEY is required');
  const kek = masterKey(keyId);
  const result = structuredClone(data);
  if (META in result) throw new Error('Reserved encryption metadata in input');
  const dek = randomBytes(32);
  const paths: string[][] = [];
  function walk(obj: Record<string, unknown>, path: string[] = []) {
    for (const [key, value] of Object.entries(obj)) {
      if (sensitive(key) && typeof value === 'string' && value) {
        obj[key] = PREFIX + JSON.stringify(EnvelopeEncryption.encryptField(value, dek));
        paths.push([...path, key]);
      } else if (value && typeof value === 'object')
        walk(value as Record<string, unknown>, [...path, key]);
    }
  }
  try {
    walk(result);
    result[META] = {
      key_id: keyId,
      wrapped_key: EnvelopeEncryption.wrapKey(dek, kek),
      paths,
    } satisfies Metadata;
    return result;
  } finally {
    dek.fill(0);
    kek.fill(0);
  }
}

/** Read old plaintext or a versioned envelope. Missing keys/tampering fail closed. */
export function decryptExtractionData(data: Record<string, unknown>): Record<string, unknown> {
  if (!(META in data)) return data;
  const result = structuredClone(data);
  const meta = result[META] as Metadata;
  const dek = EnvelopeEncryption.unwrapKey(meta.wrapped_key, masterKey(meta.key_id));
  try {
    for (const path of meta.paths) {
      let parent = result;
      if (!path.length || path.some((k) => ['__proto__', 'prototype', 'constructor'].includes(k)))
        throw new Error('Invalid encrypted path');
      for (const key of path.slice(0, -1)) parent = parent[key] as Record<string, unknown>;
      const key = path[path.length - 1]!;
      const value = parent[key];
      if (typeof value !== 'string' || !value.startsWith(PREFIX))
        throw new Error('Encrypted field missing');
      parent[key] = EnvelopeEncryption.decryptField(JSON.parse(value.slice(PREFIX.length)), dek);
    }
    delete result[META];
    return result;
  } finally {
    dek.fill(0);
  }
}

export function decryptExtractionRow<T extends { extraction_data?: unknown }>(row: T): T {
  if (!row?.extraction_data || typeof row.extraction_data !== 'object') return row;
  return {
    ...row,
    extraction_data: decryptExtractionData(row.extraction_data as Record<string, unknown>),
  };
}
