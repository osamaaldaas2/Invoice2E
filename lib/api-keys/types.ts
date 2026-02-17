/**
 * API Key types for B2B programmatic access.
 * Security: full raw key is NEVER stored or returned after initial creation.
 */

/** Available scopes for API key authorization */
export type ApiKeyScope =
  | 'invoices:read'
  | 'invoices:write'
  | 'invoices:convert'
  | 'credits:read'
  | 'batch:write';

/** Database representation of an API key */
export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  hashedKey: string;
  scopes: ApiKeyScope[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

/** Request to create a new API key */
export interface CreateApiKeyRequest {
  name: string;
  scopes: ApiKeyScope[];
  expiresAt?: string;
}

/**
 * API key metadata returned in list/get operations.
 * Never includes the full key — only prefix + last 4 chars for identification.
 */
export interface ApiKeyResponse {
  id: string;
  name: string;
  hint: string;
  scopes: ApiKeyScope[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

/**
 * Returned ONCE at creation time. The only time the full raw key is exposed.
 */
export interface ApiKeyCreatedResponse {
  key: string;
  metadata: ApiKeyResponse;
}

/** Validated API key context attached to authenticated requests */
export interface ApiKeyContext {
  keyId: string;
  userId: string;
  scopes: ApiKeyScope[];
}

/** All valid scopes for validation */
export const VALID_SCOPES: readonly ApiKeyScope[] = [
  'invoices:read',
  'invoices:write',
  'invoices:convert',
  'credits:read',
  'batch:write',
] as const;

/** API key prefix for identification */
export const API_KEY_PREFIX = 'einv_live_';
