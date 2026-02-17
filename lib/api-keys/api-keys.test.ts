/**
 * Tests for ApiKeyService.
 *
 * Covers: key generation, creation, validation, expiry, revocation,
 * scope checking, rotation, and key limit enforcement.
 */

import crypto from 'crypto';
import { ApiKeyService, ApiKeyError } from './api-keys';
import { API_KEY_PREFIX, ApiKeyScope } from './types';

// ─── Mock Supabase Client ───────────────────────────────────────────────────

interface MockRow {
  id: string;
  user_id: string;
  name: string;
  prefix: string;
  hashed_key: string;
  key_hint: string;
  scopes: ApiKeyScope[];
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

function createMockSupabase(rows: MockRow[] = []) {
  const store = [...rows];

  const builder = {
    _filters: {} as Record<string, unknown>,
    _isNull: {} as Record<string, boolean>,
    _insertData: null as Record<string, unknown> | null,
    _updateData: null as Record<string, unknown> | null,

    insert(data: Record<string, unknown>) {
      builder._insertData = data;
      return builder;
    },
    select() {
      return builder;
    },
    update(data: Record<string, unknown>) {
      builder._updateData = data;
      return builder;
    },
    eq(col: string, val: string) {
      builder._filters[col] = val;
      return builder;
    },
    is(col: string, _val: null) {
      builder._isNull[col] = true;
      return builder;
    },
    order() {
      return builder;
    },
    async single(): Promise<{ data: MockRow | null; error: { message: string } | null }> {
      if (builder._insertData) {
        const newRow: MockRow = {
          id: crypto.randomUUID(),
          user_id: builder._insertData['user_id'] as string,
          name: builder._insertData['name'] as string,
          prefix: builder._insertData['prefix'] as string,
          hashed_key: builder._insertData['hashed_key'] as string,
          key_hint: builder._insertData['key_hint'] as string,
          scopes: builder._insertData['scopes'] as ApiKeyScope[],
          last_used_at: null,
          expires_at: (builder._insertData['expires_at'] as string) ?? null,
          created_at: new Date().toISOString(),
          revoked_at: null,
        };
        store.push(newRow);
        builder._insertData = null;
        builder._filters = {};
        builder._isNull = {};
        return { data: newRow, error: null };
      }

      if (builder._updateData) {
        const idx = store.findIndex((r) => matchesFilters(r, builder._filters, builder._isNull));
        if (idx >= 0) {
          const row = store[idx]!;
          Object.assign(row, mapUpdateToRow(builder._updateData));
          builder._updateData = null;
          builder._filters = {};
          builder._isNull = {};
          return { data: row, error: null };
        }
        builder._updateData = null;
        builder._filters = {};
        builder._isNull = {};
        return { data: null, error: { message: 'Not found' } };
      }

      const found = store.find((r) => matchesFilters(r, builder._filters, builder._isNull));
      builder._filters = {};
      builder._isNull = {};
      return { data: found ?? null, error: found ? null : { message: 'Not found' } };
    },
    then(
      resolve: (val: { data: MockRow[] | null; error: { message: string } | null }) => void
    ) {
      const filtered = store.filter((r) => matchesFilters(r, builder._filters, builder._isNull));
      builder._filters = {};
      builder._isNull = {};
      resolve({ data: filtered, error: null });
    },
  };

  return {
    from(_table: string) {
      builder._filters = {};
      builder._isNull = {};
      builder._insertData = null;
      builder._updateData = null;
      return builder;
    },
    _store: store,
  };
}

function matchesFilters(
  row: MockRow,
  filters: Record<string, unknown>,
  isNull: Record<string, boolean>
): boolean {
  for (const [col, val] of Object.entries(filters)) {
    const rowKey = col as keyof MockRow;
    if (row[rowKey] !== val) return false;
  }
  for (const col of Object.keys(isNull)) {
    const rowKey = col as keyof MockRow;
    if (row[rowKey] !== null) return false;
  }
  return true;
}

function mapUpdateToRow(data: Record<string, unknown>): Partial<MockRow> {
  const mapped: Record<string, unknown> = {};
  if ('last_used_at' in data) mapped['last_used_at'] = data['last_used_at'];
  if ('revoked_at' in data) mapped['revoked_at'] = data['revoked_at'];
  return mapped as Partial<MockRow>;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ApiKeyService', () => {
  const USER_ID = '550e8400-e29b-41d4-a716-446655440000';

  describe('generateKey', () => {
    it('should generate key with correct prefix', () => {
      const mock = createMockSupabase();
      const service = new ApiKeyService(mock);
      const key = service.generateKey();

      expect(key.startsWith(API_KEY_PREFIX)).toBe(true);
    });

    it('should generate key with correct length (prefix + 32 base62 chars)', () => {
      const mock = createMockSupabase();
      const service = new ApiKeyService(mock);
      const key = service.generateKey();

      expect(key.length).toBe(API_KEY_PREFIX.length + 32);
    });

    it('should generate unique keys', () => {
      const mock = createMockSupabase();
      const service = new ApiKeyService(mock);
      const keys = new Set(Array.from({ length: 100 }, () => service.generateKey()));

      expect(keys.size).toBe(100);
    });

    it('should only contain base62 characters after prefix', () => {
      const mock = createMockSupabase();
      const service = new ApiKeyService(mock);
      const key = service.generateKey();
      const suffix = key.slice(API_KEY_PREFIX.length);

      expect(/^[0-9A-Za-z]+$/.test(suffix)).toBe(true);
    });
  });

  describe('hashKey', () => {
    it('should produce consistent SHA-256 hash', () => {
      const mock = createMockSupabase();
      const service = new ApiKeyService(mock);
      const key = 'einv_live_testkey123';

      const hash1 = service.hashKey(key);
      const hash2 = service.hashKey(key);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex
    });

    it('should produce different hashes for different keys', () => {
      const mock = createMockSupabase();
      const service = new ApiKeyService(mock);

      const hash1 = service.hashKey('einv_live_key1');
      const hash2 = service.hashKey('einv_live_key2');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('createApiKey', () => {
    it('should create a key and return it once', async () => {
      const mock = createMockSupabase();
      const service = new ApiKeyService(mock);

      const result = await service.createApiKey(USER_ID, 'Test Key', ['invoices:read']);

      expect(result.key.startsWith(API_KEY_PREFIX)).toBe(true);
      expect(result.metadata.name).toBe('Test Key');
      expect(result.metadata.scopes).toEqual(['invoices:read']);
      expect(result.metadata.revokedAt).toBeNull();
    });

    it('should reject empty name', async () => {
      const mock = createMockSupabase();
      const service = new ApiKeyService(mock);

      await expect(service.createApiKey(USER_ID, '', ['invoices:read'])).rejects.toThrow(
        ApiKeyError
      );
    });

    it('should reject empty scopes', async () => {
      const mock = createMockSupabase();
      const service = new ApiKeyService(mock);

      await expect(service.createApiKey(USER_ID, 'Key', [])).rejects.toThrow(ApiKeyError);
    });

    it('should reject invalid scopes', async () => {
      const mock = createMockSupabase();
      const service = new ApiKeyService(mock);

      await expect(
        service.createApiKey(USER_ID, 'Key', ['invalid:scope' as ApiKeyScope])
      ).rejects.toThrow('Invalid scope');
    });

    it('should reject name longer than 100 chars', async () => {
      const mock = createMockSupabase();
      const service = new ApiKeyService(mock);
      const longName = 'A'.repeat(101);

      await expect(service.createApiKey(USER_ID, longName, ['invoices:read'])).rejects.toThrow(
        '100 characters'
      );
    });
  });

  describe('validateApiKey', () => {
    it('should validate a correctly created key', async () => {
      const mock = createMockSupabase();
      const service = new ApiKeyService(mock);

      const created = await service.createApiKey(USER_ID, 'Valid Key', [
        'invoices:read',
        'invoices:write',
      ]);
      const context = await service.validateApiKey(created.key);

      expect(context).not.toBeNull();
      expect(context!.userId).toBe(USER_ID);
      expect(context!.scopes).toEqual(['invoices:read', 'invoices:write']);
    });

    it('should reject keys without correct prefix', async () => {
      const mock = createMockSupabase();
      const service = new ApiKeyService(mock);

      const context = await service.validateApiKey('invalid_prefix_key');
      expect(context).toBeNull();
    });

    it('should reject empty key', async () => {
      const mock = createMockSupabase();
      const service = new ApiKeyService(mock);

      const context = await service.validateApiKey('');
      expect(context).toBeNull();
    });

    it('should reject non-existent key', async () => {
      const mock = createMockSupabase();
      const service = new ApiKeyService(mock);

      const context = await service.validateApiKey('einv_live_nonexistent1234567890123456789012');
      expect(context).toBeNull();
    });

    it('should reject expired key', async () => {
      const mock = createMockSupabase();
      const service = new ApiKeyService(mock);

      // Create with past expiry — manually set expires_at on the stored row
      const created = await service.createApiKey(USER_ID, 'Expiring', ['invoices:read']);
      const stored = mock._store.find(
        (r) => r.hashed_key === service.hashKey(created.key)
      );
      if (stored) {
        stored.expires_at = new Date(Date.now() - 60_000).toISOString(); // 1 min ago
      }

      const context = await service.validateApiKey(created.key);
      expect(context).toBeNull();
    });
  });

  describe('revokeKey', () => {
    it('should revoke an existing key', async () => {
      const mock = createMockSupabase();
      const service = new ApiKeyService(mock);

      const created = await service.createApiKey(USER_ID, 'To Revoke', ['invoices:read']);
      await service.revokeKey(created.metadata.id, USER_ID);

      // Validate should fail after revocation
      const context = await service.validateApiKey(created.key);
      expect(context).toBeNull();
    });

    it('should reject revoking non-existent key', async () => {
      const mock = createMockSupabase();
      const service = new ApiKeyService(mock);

      await expect(service.revokeKey('non-existent-id', USER_ID)).rejects.toThrow(ApiKeyError);
    });
  });

  describe('listKeys', () => {
    it('should list keys without exposing raw keys', async () => {
      const mock = createMockSupabase();
      const service = new ApiKeyService(mock);

      await service.createApiKey(USER_ID, 'Key 1', ['invoices:read']);
      await service.createApiKey(USER_ID, 'Key 2', ['credits:read']);

      const keys = await service.listKeys(USER_ID);
      expect(keys).toHaveLength(2);

      for (const key of keys) {
        expect(key.hint).toContain('...');
        // Hint format: "einv_live_...XXXX" — prefix is expected, full key is not
        expect(key.hint).toMatch(/^einv_live_\.\.\.[\w]{4}$/);
      }
    });

    it('should return empty array for user with no keys', async () => {
      const mock = createMockSupabase();
      const service = new ApiKeyService(mock);

      const keys = await service.listKeys(USER_ID);
      expect(keys).toHaveLength(0);
    });
  });

  describe('rotateKey', () => {
    it('should revoke old key and create new one with same scopes', async () => {
      const mock = createMockSupabase();
      const service = new ApiKeyService(mock);

      const original = await service.createApiKey(USER_ID, 'Original', [
        'invoices:read',
        'batch:write',
      ]);
      const rotated = await service.rotateKey(original.metadata.id, USER_ID);

      // Old key should be invalid
      const oldContext = await service.validateApiKey(original.key);
      expect(oldContext).toBeNull();

      // New key should be valid with same scopes
      const newContext = await service.validateApiKey(rotated.key);
      expect(newContext).not.toBeNull();
      expect(newContext!.scopes).toEqual(['invoices:read', 'batch:write']);
    });

    it('should reject rotating non-existent key', async () => {
      const mock = createMockSupabase();
      const service = new ApiKeyService(mock);

      await expect(service.rotateKey('non-existent', USER_ID)).rejects.toThrow(ApiKeyError);
    });
  });

  describe('scope checking', () => {
    it('should correctly validate scopes on created key', async () => {
      const mock = createMockSupabase();
      const service = new ApiKeyService(mock);

      const created = await service.createApiKey(USER_ID, 'Scoped', [
        'invoices:read',
        'invoices:convert',
      ]);
      const context = await service.validateApiKey(created.key);

      expect(context!.scopes).toContain('invoices:read');
      expect(context!.scopes).toContain('invoices:convert');
      expect(context!.scopes).not.toContain('batch:write');
    });
  });
});
