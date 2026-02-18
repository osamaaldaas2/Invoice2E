/**
 * API Key Management Endpoints
 *
 * POST /api/keys — Create a new API key
 * GET  /api/keys — List all API keys for the authenticated user
 * DELETE /api/keys?id=<keyId> — Revoke an API key
 * PUT /api/keys?id=<keyId>&action=rotate — Rotate an API key
 *
 * All endpoints require session authentication (cookie-based).
 * API key auth is NOT used here — users manage keys via the web UI.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSessionFromCookie } from '@/lib/session';
import { logger } from '@/lib/logger';
import { ApiKeyService, ApiKeyError } from '@/lib/api-keys/api-keys';
import { CreateApiKeyRequest, VALID_SCOPES, ApiKeyScope } from '@/lib/api-keys/types';

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Supabase configuration missing');
  }
  return createClient(url, serviceKey);
}

function jsonResponse(data: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(
    { success: status < 400, ...data, timestamp: new Date().toISOString() },
    { status }
  );
}

/**
 * POST /api/keys — Create a new API key
 * Body: { name: string, scopes: ApiKeyScope[], expiresAt?: string }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return jsonResponse({ error: 'Authentication required' }, 401);
    }

    const body = await request.json() as CreateApiKeyRequest;

    // Validate request body
    if (!body.name || typeof body.name !== 'string') {
      return jsonResponse({ error: 'name is required and must be a string' }, 400);
    }

    if (!Array.isArray(body.scopes) || body.scopes.length === 0) {
      return jsonResponse({ error: 'scopes must be a non-empty array' }, 400);
    }

    for (const scope of body.scopes) {
      if (!VALID_SCOPES.includes(scope as ApiKeyScope)) {
        return jsonResponse({ error: `Invalid scope: ${scope}` }, 400);
      }
    }

    if (body.expiresAt) {
      const expDate = new Date(body.expiresAt);
      if (isNaN(expDate.getTime()) || expDate <= new Date()) {
        return jsonResponse({ error: 'expiresAt must be a valid future date' }, 400);
      }
    }

    const supabase = getSupabaseAdmin();
    const service = new ApiKeyService(supabase as any);

    // FIX: Audit #059 — limit API keys per user
    const MAX_API_KEYS_PER_USER = 10;
    const existingKeys = await service.listApiKeys(session.userId);
    if (existingKeys.length >= MAX_API_KEYS_PER_USER) {
      return jsonResponse({ error: `Maximum ${MAX_API_KEYS_PER_USER} API keys per user` }, 429);
    }

    const result = await service.createApiKey(
      session.userId,
      body.name,
      body.scopes,
      body.expiresAt
    );

    return jsonResponse({ data: result }, 201);
  } catch (error) {
    if (error instanceof ApiKeyError) {
      return jsonResponse({ error: error.message }, 400);
    }
    logger.error('Failed to create API key', {
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
}

/**
 * GET /api/keys — List all API keys for the authenticated user
 */
export async function GET(): Promise<NextResponse> {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return jsonResponse({ error: 'Authentication required' }, 401);
    }

    const supabase = getSupabaseAdmin();
    const service = new ApiKeyService(supabase as any);
    const keys = await service.listKeys(session.userId);

    return jsonResponse({ data: keys });
  } catch (error) {
    logger.error('Failed to list API keys', {
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
}

/**
 * DELETE /api/keys?id=<keyId> — Revoke an API key
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return jsonResponse({ error: 'Authentication required' }, 401);
    }

    const keyId = request.nextUrl.searchParams.get('id');
    if (!keyId) {
      return jsonResponse({ error: 'id query parameter is required' }, 400);
    }

    const supabase = getSupabaseAdmin();
    const service = new ApiKeyService(supabase as any);
    await service.revokeKey(keyId, session.userId);

    return jsonResponse({ message: 'API key revoked' });
  } catch (error) {
    if (error instanceof ApiKeyError) {
      return jsonResponse({ error: error.message }, 404);
    }
    logger.error('Failed to revoke API key', {
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
}

/**
 * PUT /api/keys?id=<keyId>&action=rotate — Rotate an API key
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return jsonResponse({ error: 'Authentication required' }, 401);
    }

    const keyId = request.nextUrl.searchParams.get('id');
    const action = request.nextUrl.searchParams.get('action');

    if (!keyId) {
      return jsonResponse({ error: 'id query parameter is required' }, 400);
    }

    if (action !== 'rotate') {
      return jsonResponse({ error: 'Only action=rotate is supported' }, 400);
    }

    const supabase = getSupabaseAdmin();
    const service = new ApiKeyService(supabase as any);
    const result = await service.rotateKey(keyId, session.userId);

    return jsonResponse({ data: result });
  } catch (error) {
    if (error instanceof ApiKeyError) {
      return jsonResponse({ error: error.message }, 404);
    }
    logger.error('Failed to rotate API key', {
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
}

