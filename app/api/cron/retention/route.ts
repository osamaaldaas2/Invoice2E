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

const resolveTable = (entityType: string) => {
  if (entityType === 'invoice' || entityType === 'extraction') return 'invoice_extractions';
  if (entityType === 'conversion') return 'invoice_conversions';
  throw new Error(`Retention is not configured for entity type: ${entityType}`);
};

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

    // S3.7: Supabase-backed retention DB adapter
    const dbAdapter: RetentionDatabaseAdapter = {
      findExpiredEntities: async ({ entityType, olderThan, limit }) => {
        const { data, error } = await supabase
          .from(resolveTable(entityType))
          .select('id, created_at, user_id, archived_at, users!inner(country)')
          .is('archived_at', null)
          .lt('created_at', olderThan.toISOString())
          .limit(limit);
        if (error) throw error;
        return (data ?? []).map(
          (r: Record<string, unknown>) =>
            ({
              id: r.id as string,
              entityType,
              createdAt: new Date(r.created_at as string),
              userId: r.user_id as string,
              country: (r.users as { country: string }).country,
              isArchived: Boolean(r.archived_at),
            }) as unknown as RetainableEntity
        );
      },
      archiveEntities: async (entityIds, entityType) => {
        const { error } = await supabase
          .from(resolveTable(entityType))
          .update({ archived_at: new Date().toISOString() })
          .in('id', entityIds);
        if (error) throw error;
      },
      anonymizeEntities: async () => {
        throw new Error(
          'Automated anonymization requires a reviewed entity-specific implementation'
        );
      },
      deleteEntities: async () => {
        throw new Error('Automated deletion requires a reviewed entity-specific implementation');
      },
      writeRetentionLog: async (entry) => {
        const { error } = await supabase.from('retention_log').insert(entry);
        if (error) throw error;
      },
      getDueSchedules: async (asOf) => {
        const { data, error } = await supabase
          .from('retention_schedules')
          .select('*')
          .lte('next_run_at', asOf.toISOString())
          .eq('enabled', true);

        if (error) throw error;
        return (data ?? []).map((r) => ({
          policyId: r.policy_id,
          entityType: r.entity_type,
          action: r.action,
          nextRunAt: new Date(r.next_run_at),
        }));
      },
      updateScheduleNextRun: async (policyId, nextRunAt) => {
        const { error } = await supabase
          .from('retention_schedules')
          .update({ next_run_at: nextRunAt.toISOString() })
          .eq('policy_id', policyId);
        if (error) throw error;
      },
      countRetainedEntities: async (entityType) => {
        const { count, error } = await supabase
          .from(resolveTable(entityType))
          .select('*', { count: 'exact', head: true });
        if (error) throw error;
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

    return NextResponse.json(
      {
        success: result.errors.length === 0,
        result,
        timestamp: new Date().toISOString(),
      },
      { status: result.errors.length ? 500 : 200 }
    );
  } catch (error) {
    logger.error('Retention check failed', {
      error: error instanceof Error ? error.message : String(error),
      audit: '#023',
    });
    return NextResponse.json({ success: false, error: 'Retention check failed' }, { status: 500 });
  }
}
