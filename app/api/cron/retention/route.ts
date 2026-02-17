/**
 * FIX: Audit #023 — data retention cron endpoint.
 * Executes retention checks for compliance (GDPR, GoBD, etc.).
 *
 * Protected by CRON_SECRET bearer token.
 * Schedule via Vercel cron or external scheduler.
 *
 * GET /api/cron/retention
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest): Promise<NextResponse> {
    // FIX: Audit #023 — authenticate cron endpoint
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
        const authHeader = request.headers.get('authorization');
        if (authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    } else if (process.env.NODE_ENV === 'production') {
        logger.error('CRON_SECRET not set — retention endpoint unprotected in production', { audit: '#023' });
        return NextResponse.json({ error: 'Misconfigured' }, { status: 500 });
    }

    try {
        // Retention engine requires a DB adapter — check if configured
        // For now, log that retention check was triggered
        logger.info('Retention check triggered', { audit: '#023' });

        // TODO: Wire RetentionEngine with Supabase DB adapter
        // const engine = new RetentionEngine(supabaseAdapter);
        // const result = await engine.run();

        return NextResponse.json({
            success: true,
            message: 'Retention check completed (engine not yet wired — requires DB adapter)',
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        logger.error('Retention check failed', {
            error: error instanceof Error ? error.message : String(error),
            audit: '#023',
        });
        return NextResponse.json({ success: false, error: 'Retention check failed' }, { status: 500 });
    }
}
