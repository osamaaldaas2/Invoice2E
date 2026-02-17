/**
 * Idempotency-Key middleware for Next.js API routes.
 *
 * Prevents duplicate mutations (double credit deductions, repeated purchases)
 * by caching responses keyed on the `Idempotency-Key` header + authenticated user.
 *
 * Usage:
 *   import { withIdempotency } from '@/lib/idempotency';
 *   export const POST = withIdempotency(async (request) => { ... });
 *
 * The client sends an `Idempotency-Key` header (typically a UUID).
 * If the same key+user combination was already processed and the cached
 * response has not expired, the cached response is returned immediately
 * without re-executing the handler.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import type { IdempotencyKeyRow, IdempotencyCheckResult, IdempotencyOptions } from '@/types/idempotency';
import { getAuthenticatedUser } from '@/lib/auth';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const IDEMPOTENCY_HEADER = 'idempotency-key';

/**
 * Look up a previously stored idempotency response.
 *
 * @param key - The idempotency key from the client header.
 * @param userId - Authenticated user id.
 * @returns Cached response data if found and not expired, otherwise `{ hit: false }`.
 */
async function checkIdempotencyKey(key: string, userId: string): Promise<IdempotencyCheckResult> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('idempotency_keys')
    .select('response_status, response_body, expires_at')
    .eq('idempotency_key', key)
    .eq('user_id', userId)
    .single<Pick<IdempotencyKeyRow, 'response_status' | 'response_body' | 'expires_at'>>();

  if (error || !data) {
    return { hit: false };
  }

  // Check expiry
  if (new Date(data.expires_at) < new Date()) {
    // Expired — allow re-processing; clean up asynchronously
    void cleanupExpiredKey(key, userId);
    return { hit: false };
  }

  return { hit: true, status: data.response_status, body: data.response_body };
}

/**
 * Store the response for a given idempotency key.
 *
 * @param key - The idempotency key.
 * @param userId - Authenticated user id.
 * @param requestPath - The request path (for debugging/auditing).
 * @param status - HTTP status code of the response.
 * @param body - Serialised response body.
 * @param ttlMs - Time-to-live in milliseconds.
 */
async function storeIdempotencyKey(
  key: string,
  userId: string,
  requestPath: string,
  status: number,
  body: string,
  ttlMs: number,
): Promise<void> {
  const supabase = createServerClient();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  const { error } = await supabase.from('idempotency_keys').upsert(
    {
      idempotency_key: key,
      user_id: userId,
      request_path: requestPath,
      response_status: status,
      response_body: body,
      expires_at: expiresAt,
    },
    { onConflict: 'idempotency_key,user_id' },
  );

  if (error) {
    // Non-fatal — log and continue; the response was already sent
    logger.error('Failed to store idempotency key', { key, userId, error: error.message });
  }
}

/**
 * Remove an expired idempotency record.
 */
async function cleanupExpiredKey(key: string, userId: string): Promise<void> {
  const supabase = createServerClient();
  await supabase
    .from('idempotency_keys')
    .delete()
    .eq('idempotency_key', key)
    .eq('user_id', userId);
}

/**
 * Wrap a Next.js route handler with idempotency protection.
 *
 * @param handler - The original route handler.
 * @param options - Optional configuration.
 * @returns A wrapped handler that checks/stores idempotency keys.
 *
 * @example
 * ```ts
 * import { withIdempotency } from '@/lib/idempotency';
 *
 * export const POST = withIdempotency(async (request: NextRequest) => {
 *   // ... deduct credits, process payment, etc.
 *   return NextResponse.json({ success: true, data: result });
 * });
 * ```
 */
export function withIdempotency(
  handler: (request: NextRequest) => Promise<NextResponse>,
  options: IdempotencyOptions = {},
): (request: NextRequest) => Promise<NextResponse> {
  const { ttlMs = DEFAULT_TTL_MS, required = false } = options;

  return async (request: NextRequest): Promise<NextResponse> => {
    const idempotencyKey = request.headers.get(IDEMPOTENCY_HEADER);

    // If no key provided, either reject or pass through
    if (!idempotencyKey) {
      if (required) {
        return NextResponse.json(
          { success: false, error: 'Idempotency-Key header is required for this endpoint' },
          { status: 400 },
        );
      }
      // No key — execute without idempotency protection
      return handler(request);
    }

    // Validate key format (max 255 chars, printable ASCII)
    if (idempotencyKey.length > 255 || !/^[\x20-\x7E]+$/.test(idempotencyKey)) {
      return NextResponse.json(
        { success: false, error: 'Invalid Idempotency-Key format' },
        { status: 400 },
      );
    }

    // Authenticate to get user id
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 },
      );
    }

    const userId = user.id;
    const requestPath = request.nextUrl.pathname;

    // Check for existing response
    const cached = await checkIdempotencyKey(idempotencyKey, userId);
    if (cached.hit) {
      logger.info('Idempotency cache hit', { idempotencyKey, userId, requestPath });
      return new NextResponse(cached.body, {
        status: cached.status,
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Replayed': 'true',
        },
      });
    }

    // Execute the handler
    const response = await handler(request);

    // Store the response for future replays
    const responseBody = await response.clone().text();
    await storeIdempotencyKey(
      idempotencyKey,
      userId,
      requestPath,
      response.status,
      responseBody,
      ttlMs,
    );

    return response;
  };
}
