/**
 * FIX: Audit #024 — GDPR Art. 17 right to erasure endpoint.
 * POST /api/user/data-deletion — request data deletion/pseudonymization.
 *
 * Financial records are retained per GoBD/tax law but PII is pseudonymized.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { createUserScopedClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import { handleApiError } from '@/lib/api-helpers';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const rateLimitResult = await checkRateLimitAsync(getRequestIdentifier(request), 'api');
    if (!rateLimitResult.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createUserScopedClient(user.id);

    // FIX: Audit #024 — record GDPR erasure request
    // Requests require administrative review of retention obligations
    const { error } = await supabase.from('gdpr_requests').insert({
      subject_id: user.id,
      request_type: 'erasure',
      status: 'pending',
      requested_at: new Date().toISOString(),
    });

    if (error) {
      logger.error('Failed to create GDPR erasure request', {
        userId: user.id,
        error: error.message,
      });
      return NextResponse.json(
        { success: false, error: 'Failed to process request' },
        { status: 500 }
      );
    }

    logger.info('GDPR erasure request created', { userId: user.id, audit: '#024' });

    return NextResponse.json({
      success: true,
      message:
        'Your data deletion request has been received for review. Records subject to retention obligations require a separate assessment.',
    });
  } catch (error) {
    return handleApiError(error, 'GDPR data deletion error', {
      message: 'Failed to process deletion request',
      includeSuccess: true,
    });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const db = await createUserScopedClient(user.id);
    const { data, error } = await db
      .from('gdpr_requests')
      .select('id,status,requested_at,completed_at')
      .eq('subject_id', user.id)
      .eq('request_type', 'erasure')
      .order('requested_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    return NextResponse.json({ success: true, requests: data });
  } catch (error) {
    return handleApiError(error, 'Deletion request status failed');
  }
}
