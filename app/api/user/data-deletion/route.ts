/**
 * FIX: Audit #024 — GDPR Art. 17 right to erasure endpoint.
 * POST /api/user/data-deletion — request data deletion/pseudonymization.
 *
 * Financial records are retained per GoBD/tax law but PII is pseudonymized.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import { handleApiError } from '@/lib/api-helpers';

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = createServerClient();

        // FIX: Audit #024 — record GDPR erasure request
        // Actual pseudonymization is processed asynchronously to avoid timeout
        const { error } = await supabase.from('gdpr_requests').insert({
            user_id: user.id,
            request_type: 'erasure',
            status: 'pending',
            requested_at: new Date().toISOString(),
        });

        if (error) {
            logger.error('Failed to create GDPR erasure request', { userId: user.id, error: error.message });
            return NextResponse.json({ success: false, error: 'Failed to process request' }, { status: 500 });
        }

        logger.info('GDPR erasure request created', { userId: user.id, audit: '#024' });

        return NextResponse.json({
            success: true,
            message: 'Your data deletion request has been received and will be processed within 30 days per GDPR requirements.',
        });
    } catch (error) {
        return handleApiError(error, 'GDPR data deletion error', {
            message: 'Failed to process deletion request',
            includeSuccess: true,
        });
    }
}
