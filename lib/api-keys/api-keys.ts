/**
 * API Key Service for B2B programmatic access.
 *
 * Security constraints:
 * - Raw keys are NEVER stored or logged
 * - Keys are hashed with SHA-256 before storage
 * - Full key is returned exactly ONCE at creation
 * - List operations return only prefix + last 4 chars
 */

import crypto from 'crypto';
import { logger } from '@/lib/logger';
import {
  ApiKey,
  ApiKeyContext,
  ApiKeyCreatedResponse,
  ApiKeyResponse,
  ApiKeyScope,
  API_KEY_PREFIX,
  VALID_SCOPES,
} from './types';

/** Base62 alphabet for key generation */
const BASE62_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Maximum API keys per user */
const MAX_KEYS_PER_USER = 10;

interface SupabaseClient {
  from(table: string): SupabaseQueryBuilder;
}

interface SupabaseQueryBuilder {
  insert(data: Record<string, unknown>): SupabaseQueryBuilder;
  select(columns?: string): SupabaseQueryBuilder;
  update(data: Record<string, unknown>): SupabaseQueryBuilder;
  eq(column: string, value: string): SupabaseQueryBuilder;
  is(column: string, value: null): SupabaseQueryBuilder;
  order(column: string, options?: { ascending: boolean }): SupabaseQueryBuilder;
  single(): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
  then(
    resolve: (value: {
      data: Record<string, unknown>[] | null;
      error: { message: string } | null;
      count?: number | null;
    }) => void
  ): void;
}

/**
 * Service for managing API keys.
 * Uses dependency injection for the Supabase client (testable).
 */
export class ApiKeyService {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Generate a cryptographically secure API key.
   * Format: einv_live_ + 32 random bytes encoded as base62
   */
  generateKey(): string {
    const randomBytes = crypto.randomBytes(32);
    let encoded = '';
    for (const byte of randomBytes) {
      encoded += BASE62_CHARS[byte % 62];
    }
    return `${API_KEY_PREFIX}${encoded}`;
  }

  /**
   * Hash a raw key with SHA-256. Used for storage and lookup.
   * SECURITY: raw key must never be logged or persisted.
   */
  hashKey(rawKey: string): string {
    return crypto.createHash('sha256').update(rawKey, 'utf8').digest('hex');
  }

  /**
   * Extract a display hint from a raw key: prefix + last 4 chars.
   */
  private getHint(rawKey: string): string {
    return `${API_KEY_PREFIX}...${rawKey.slice(-4)}`;
  }

  /**
   * Map a database row to an ApiKeyResponse (safe metadata only).
   */
  private toResponse(row: Record<string, unknown>): ApiKeyResponse {
    return {
      id: row['id'] as string,
      name: row['name'] as string,
      hint: `${row['prefix'] as string}...${(row['key_hint'] as string) ?? '****'}`,
      scopes: row['scopes'] as ApiKeyScope[],
      lastUsedAt: (row['last_used_at'] as string) ?? null,
      expiresAt: (row['expires_at'] as string) ?? null,
      createdAt: row['created_at'] as string,
      revokedAt: (row['revoked_at'] as string) ?? null,
    };
  }

  /**
   * Create a new API key for a user.
   * Returns the full key ONCE. After this, only the hint is available.
   *
   * @param userId - Owner of the key
   * @param name - Human-readable label
   * @param scopes - Permissions granted to this key
   * @param expiresAt - Optional expiration date (ISO 8601)
   */
  async createApiKey(
    userId: string,
    name: string,
    scopes: ApiKeyScope[],
    expiresAt?: string
  ): Promise<ApiKeyCreatedResponse> {
    // Validate scopes
    for (const scope of scopes) {
      if (!VALID_SCOPES.includes(scope)) {
        throw new ApiKeyError(`Invalid scope: ${scope}`);
      }
    }

    if (scopes.length === 0) {
      throw new ApiKeyError('At least one scope is required');
    }

    if (!name || name.trim().length === 0) {
      throw new ApiKeyError('Key name is required');
    }

    if (name.length > 100) {
      throw new ApiKeyError('Key name must be 100 characters or fewer');
    }

    // Check key limit
    const existingKeys = await this.listKeys(userId);
    const activeKeys = existingKeys.filter((k) => k.revokedAt === null);
    if (activeKeys.length >= MAX_KEYS_PER_USER) {
      throw new ApiKeyError(`Maximum of ${MAX_KEYS_PER_USER} active API keys per user`);
    }

    const rawKey = this.generateKey();
    const hashedKey = this.hashKey(rawKey);
    const keyHint = rawKey.slice(-4);

    const { data, error } = await this.supabase
      .from('api_keys')
      .insert({
        user_id: userId,
        name: name.trim(),
        prefix: API_KEY_PREFIX,
        hashed_key: hashedKey,
        key_hint: keyHint,
        scopes,
        expires_at: expiresAt ?? null,
      })
      .select()
      .single();

    if (error || !data) {
      logger.error('Failed to create API key', { userId, error: error?.message });
      throw new ApiKeyError('Failed to create API key');
    }

    logger.info('API key created', { userId, keyId: data['id'] as string });

    return {
      key: rawKey,
      metadata: this.toResponse(data),
    };
  }

  /**
   * Validate a raw API key.
   * Hashes the key, looks it up, checks expiry and revocation, updates lastUsedAt.
   *
   * @param rawKey - The full API key from the request
   * @returns ApiKeyContext if valid, null otherwise
   */
  async validateApiKey(rawKey: string): Promise<ApiKeyContext | null> {
    if (!rawKey || !rawKey.startsWith(API_KEY_PREFIX)) {
      return null;
    }

    const hashedKey = this.hashKey(rawKey);

    const { data, error } = await this.supabase
      .from('api_keys')
      .select()
      .eq('hashed_key', hashedKey)
      .is('revoked_at', null)
      .single();

    if (error || !data) {
      return null;
    }

    // Check expiration
    const expiresAt = data['expires_at'] as string | null;
    if (expiresAt && new Date(expiresAt) < new Date()) {
      logger.info('API key expired', { keyId: data['id'] as string });
      return null;
    }

    // Update last used timestamp (fire-and-forget, non-blocking)
    this.supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', data['id'] as string)
      .then(() => {
        /* intentionally empty — fire and forget */
      });

    return {
      keyId: data['id'] as string,
      userId: data['user_id'] as string,
      scopes: data['scopes'] as ApiKeyScope[],
    };
  }

  /**
   * Revoke an API key (soft delete).
   */
  async revokeKey(keyId: string, userId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', keyId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !data) {
      throw new ApiKeyError('API key not found or already revoked');
    }

    logger.info('API key revoked', { keyId, userId });
  }

  /**
   * List all API keys for a user (metadata only, never full keys).
   */
  async listKeys(userId: string): Promise<ApiKeyResponse[]> {
    return new Promise((resolve, reject) => {
      this.supabase
        .from('api_keys')
        .select()
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .then(({ data, error }) => {
          if (error) {
            logger.error('Failed to list API keys', { userId, error: error.message });
            reject(new ApiKeyError('Failed to list API keys'));
            return;
          }
          resolve((data ?? []).map((row) => this.toResponse(row)));
        });
    });
  }

  /**
   * Rotate an API key: revoke the old one and create a new one with the same scopes.
   * Returns the new key ONCE.
   */
  async rotateKey(keyId: string, userId: string): Promise<ApiKeyCreatedResponse> {
    // Fetch the existing key metadata
    const { data, error } = await this.supabase
      .from('api_keys')
      .select()
      .eq('id', keyId)
      .eq('user_id', userId)
      .is('revoked_at', null)
      .single();

    if (error || !data) {
      throw new ApiKeyError('API key not found or already revoked');
    }

    // Revoke the old key
    await this.revokeKey(keyId, userId);

    // Create new key with same scopes and name
    return this.createApiKey(
      userId,
      `${data['name'] as string} (rotated)`,
      data['scopes'] as ApiKeyScope[],
      (data['expires_at'] as string) ?? undefined
    );
  }
}

/**
 * Typed error for API key operations.
 */
export class ApiKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiKeyError';
  }
}
