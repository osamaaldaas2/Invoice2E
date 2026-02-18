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
import { isFeatureEnabled, FEATURE_FLAGS } from '@/lib/feature-flags';
import { createAdminClient } from '@/lib/supabase.server';
import {
  RetentionEngine,
  type RetentionDatabaseAdapter,
  type RetainableEntity,
  type RetentionLogger,
} from '@/lib/retention';

export async function GET(request: NextRequest): Promise<NextResponse> {
  // FIX: Audit #023 — authenticate cron endpoint
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === 'production') {
    logger.error('CRON_SECRET not set — retention endpoint unprotected in production', {
      audit: '#023',
    });
    return NextResponse.json({ error: 'Misconfigured' }, { status: 500 });
  }

  try {
    logger.info('Retention check triggered', { audit: '#023' });

    const supabase = createAdminClient();
    const useRetention = await isFeatureEnabled(supabase, FEATURE_FLAGS.USE_DATA_RETENTION).catch(
      () => false
    );

    if (!useRetention) {
      return NextResponse.json({
        success: true,
        message: 'Retention engine disabled (USE_DATA_RETENTION flag is OFF)',
        timestamp: new Date().toISOString(),
      });
    }

    // Supabase-backed retention DB adapter
    const dbAdapter: RetentionDatabaseAdapter = {
      findExpiredEntities: async (entityType, olderThan) => {
        const table =
          entityType === 'invoice'
            ? 'invoice_extractions'
            : entityType === 'conversion'
              ? 'invoice_conversions'
              : entityType === 'audit_log'
                ? 'audit_logs'
                : entityType;
        const { data } = await supabase
          .from(table)
          .select('id, created_at, user_id')
          .lt('created_at', olderThan.toISOString())
          .limit(1000);
        return (data ?? []).map((r: any) => ({
          id: r.id,
          entityType,
          createdAt: r.created_at,
          userId: r.user_id,
        })) as RetainableEntity[];
      },
      deleteEntity: async (id, entityType) => {
        const table =
          entityType === 'invoice'
            ? 'invoice_extractions'
            : entityType === 'conversion'
              ? 'invoice_conversions'
              : entityType === 'audit_log'
                ? 'audit_logs'
                : entityType;
        await supabase.from(table).delete().eq('id', id);
      },
      anonymizeEntity: async (id, entityType) => {
        const table =
          entityType === 'invoice'
            ? 'invoice_extractions'
            : entityType === 'conversion'
              ? 'invoice_conversions'
              : entityType;
        await supabase.from(table).update({ user_id: 'anonymized' }).eq('id', id);
      },
      logRetentionAction: async (action) => {
        logger.info('Retention action', action);
      },
    };

    const retentionLogger: RetentionLogger = {
      info: (msg, meta) => logger.info(msg, meta),
      warn: (msg, meta) => logger.warn(msg, meta),
      error: (msg, meta) => logger.error(msg, meta),
    };

    const engine = new RetentionEngine(dbAdapter, retentionLogger);
    const result = await engine.run();

    return NextResponse.json({
      success: true,
      result,
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
