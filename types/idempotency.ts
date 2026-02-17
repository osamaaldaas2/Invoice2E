/**
 * Idempotency system types.
 *
 * Used by the Idempotency-Key middleware to prevent duplicate mutations
 * (e.g. double credit deductions).
 */

/** Database row shape for the idempotency_keys table (snake_case). */
export interface IdempotencyKeyRow {
  id: string;
  idempotency_key: string;
  user_id: string;
  request_path: string;
  response_status: number;
  response_body: string;
  created_at: string;
  expires_at: string;
}

/** Application-level idempotency key record (camelCase). */
export interface IdempotencyKeyRecord {
  id: string;
  idempotencyKey: string;
  userId: string;
  requestPath: string;
  responseStatus: number;
  responseBody: string;
  createdAt: Date;
  expiresAt: Date;
}

/** Result of an idempotency check. */
export type IdempotencyCheckResult =
  | { hit: true; status: number; body: string }
  | { hit: false };

/** Options for the idempotency middleware wrapper. */
export interface IdempotencyOptions {
  /** TTL in milliseconds for cached responses. Default: 86_400_000 (24 h). */
  ttlMs?: number;
  /** Whether the Idempotency-Key header is required. Default: false. */
  required?: boolean;
}
