/**
 * FIX: Audit #024 — GDPR Art. 20 data portability endpoint.
 * POST /api/user/data-export — export all user data as JSON.
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

    // FIX: Audit #024 — collect all user data for portability export
    const [
      { data: userData },
      { data: credits },
      { data: extractions },
      { data: conversions },
      { data: payments },
    ] = await Promise.all([
      supabase
        .from('users')
        .select('id, email, first_name, last_name, role, created_at')
        .eq('id', user.id)
        .single(),
      supabase.from('user_credits').select('*').eq('user_id', user.id).single(),
      supabase
        .from('invoice_extractions')
        .select('id, file_name, status, created_at')
        .eq('user_id', user.id),
      supabase
        .from('invoice_conversions')
        .select('id, conversion_format, status, created_at')
        .eq('user_id', user.id),
      supabase
        .from('payment_transactions')
        .select('id, amount, currency, status, created_at')
        .eq('user_id', user.id),
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      user: userData,
      credits,
      extractions: extractions || [],
      conversions: conversions || [],
      payments: payments || [],
    };

    logger.info('GDPR data export completed', { userId: user.id, audit: '#024' });

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="invoice2e-data-export-${user.id}.json"`,
      },
    });
  } catch (error) {
    return handleApiError(error, 'GDPR data export error', {
      message: 'Failed to export data',
      includeSuccess: true,
    });
  }
}
