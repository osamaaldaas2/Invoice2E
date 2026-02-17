/**
 * API Key authentication middleware for B2B programmatic access.
 *
 * Extracts API key from Authorization: Bearer or X-API-Key header,
 * validates it, checks scopes, and enforces rate limits.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { ApiKeyContext, ApiKeyScope } from './types';
import { ApiKeyService } from './api-keys';

/** Rate limit configuration per API key */
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60; // 60 requests per minute per key

/** In-memory rate limit store. In production, use Redis. */
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Extract raw API key from request headers.
 * Supports: Authorization: Bearer <key> and X-API-Key: <key>
 */
function extractApiKey(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer einv_live_')) {
    return authHeader.slice(7); // Remove "Bearer "
  }

  const xApiKey = request.headers.get('x-api-key');
  if (xApiKey?.startsWith('einv_live_')) {
    return xApiKey;
  }

  return null;
}

/**
 * Check rate limit for an API key.
 * Returns remaining requests or -1 if limit exceeded.
 */
function checkRateLimit(keyId: string): { isAllowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(keyId);

  if (!entry || now > entry.resetAt) {
    const resetAt = now + RATE_LIMIT_WINDOW_MS;
    rateLimitStore.set(keyId, { count: 1, resetAt });
    return { isAllowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1, resetAt };
  }

  entry.count += 1;
  const remaining = RATE_LIMIT_MAX_REQUESTS - entry.count;

  if (remaining < 0) {
    return { isAllowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return { isAllowed: true, remaining, resetAt: entry.resetAt };
}

/**
 * Create a JSON error response with consistent format.
 */
function errorResponse(
  message: string,
  status: number,
  headers?: Record<string, string>
): NextResponse {
  return NextResponse.json(
    { success: false, error: message, timestamp: new Date().toISOString() },
    { status, headers }
  );
}

/**
 * Authenticate a request using an API key.
 *
 * @param request - The incoming Next.js request
 * @param requiredScopes - Scopes needed for this operation
 * @param supabaseClient - Injected Supabase client
 * @returns ApiKeyContext if authenticated, or NextResponse error
 */
export async function authenticateApiKey(
  request: NextRequest,
  requiredScopes: ApiKeyScope[],
  supabaseClient: { from(table: string): unknown }
): Promise<ApiKeyContext | NextResponse> {
  const rawKey = extractApiKey(request);

  if (!rawKey) {
    return errorResponse(
      'Missing API key. Provide via Authorization: Bearer <key> or X-API-Key header.',
      401
    );
  }

  // Validate key
  const service = new ApiKeyService(supabaseClient as ConstructorParameters<typeof ApiKeyService>[0]);
  const context = await service.validateApiKey(rawKey);

  if (!context) {
    logger.warn('Invalid or expired API key used');
    return errorResponse('Invalid or expired API key', 401);
  }

  // Check rate limit
  const rateLimit = checkRateLimit(context.keyId);
  if (!rateLimit.isAllowed) {
    logger.warn('API key rate limit exceeded', { keyId: context.keyId });
    return errorResponse('Rate limit exceeded. Try again later.', 429, {
      'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
      'X-RateLimit-Limit': String(RATE_LIMIT_MAX_REQUESTS),
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': String(Math.ceil(rateLimit.resetAt / 1000)),
    });
  }

  // Check scopes
  for (const scope of requiredScopes) {
    if (!context.scopes.includes(scope)) {
      logger.warn('API key missing required scope', {
        keyId: context.keyId,
        required: scope,
        granted: context.scopes,
      });
      return errorResponse(`Insufficient permissions. Required scope: ${scope}`, 403);
    }
  }

  return context;
}

/**
 * Check if a value is an ApiKeyContext (not an error response).
 */
export function isApiKeyContext(
  result: ApiKeyContext | NextResponse
): result is ApiKeyContext {
  return 'keyId' in result && 'userId' in result;
}
