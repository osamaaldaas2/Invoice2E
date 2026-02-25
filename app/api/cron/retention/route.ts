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
} from '@/lib/retention';

const resolveTable = (entityType: string) =>
  entityType === 'invoice'
    ? 'invoice_extractions'
    : entityType === 'conversion'
      ? 'invoice_conversions'
      : entityType === 'audit_log'
        ? 'audit_logs'
        : entityType;

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
    const useRetention = await isFeatureEnabled(
      supabase,
      FEATURE_FLAGS.USE_DATA_RETENTION,
    ).catch(() => false);

    if (!useRetention) {
      return NextResponse.json({
        success: true,
        message: 'Retention engine disabled (USE_DATA_RETENTION flag is OFF)',
        timestamp: new Date().toISOString(),
      });
    }

    // S3.7: Supabase-backed retention DB adapter
    const dbAdapter: RetentionDatabaseAdapter = {
      findExpiredEntities: async ({ entityType, olderThan, limit }) => {
        const { data } = await supabase
          .from(resolveTable(entityType))
          .select('id, created_at, user_id, status')
          .lt('created_at', olderThan.toISOString())
          .limit(limit);
        return (data ?? []).map(
          (r: Record<string, unknown>) =>
            ({
              id: r.id as string,
              entityType,
              createdAt: new Date(r.created_at as string),
              userId: r.user_id as string,
              country: 'DE',
              isArchived: (r.status as string) === 'archived',
            }) as unknown as RetainableEntity,
        );
      },
      archiveEntities: async (entityIds, entityType) => {
        await supabase
          .from(resolveTable(entityType))
          .update({ status: 'archived' })
          .in('id', entityIds);
      },
      anonymizeEntities: async (entityIds, entityType) => {
        await supabase
          .from(resolveTable(entityType))
          .update({ user_id: 'anonymized' })
          .in('id', entityIds);
      },
      deleteEntities: async (entityIds, entityType) => {
        await supabase.from(resolveTable(entityType)).delete().in('id', entityIds);
      },
      writeRetentionLog: async (entry) => {
        await supabase.from('retention_logs').insert(entry);
      },
      getDueSchedules: async (asOf) => {
        const { data } = await supabase
          .from('retention_schedules')
          .select('*')
          .lte('next_run_at', asOf.toISOString())
          .eq('enabled', true);

        return (data ?? []) as any[];
      },
      updateScheduleNextRun: async (policyId, nextRunAt) => {
        await supabase
          .from('retention_schedules')
          .update({ next_run_at: nextRunAt.toISOString() })
          .eq('policy_id', policyId);
      },
      countRetainedEntities: async (entityType) => {
        const { count } = await supabase
          .from(resolveTable(entityType))
          .select('*', { count: 'exact', head: true });
        return count ?? 0;
      },
    };

    const retentionLogger = {
      info: (msg: string, meta?: Record<string, unknown>) => logger.info(msg, meta),
      warn: (msg: string, meta?: Record<string, unknown>) => logger.warn(msg, meta),
      error: (msg: string, meta?: Record<string, unknown>) => logger.error(msg, meta),
    };

    const engine = new RetentionEngine({ db: dbAdapter, logger: retentionLogger });
    const result = await engine.processRetentionSchedule();

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
    return NextResponse.json(
      { success: false, error: 'Retention check failed' },
      { status: 500 },
    );
  }
}
