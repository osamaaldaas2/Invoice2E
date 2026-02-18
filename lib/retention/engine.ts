/**
 * Data Retention Engine
 *
 * Evaluates, archives, anonymizes, and deletes entities based on
 * per-jurisdiction retention policies. All actions are audit-logged
 * for regulatory compliance.
 *
 * Intent: Provide a deterministic, testable retention processor that
 * can be invoked on a schedule (cron) or on-demand for compliance.
 *
 * @module lib/retention/engine
 */

import { createHash } from 'crypto';
import type {
  RetentionPolicy,
  RetentionAction,
  RetentionSchedule,
  RetentionResult,
  RetentionError,
  RetentionReport,
  RetainableEntityType,
  RetentionLogRow,
} from './types';
import { RETENTION_POLICIES } from './policies';

// ─── Database adapter interface (dependency injection) ────────────────────────

/** Minimal entity record returned by the database adapter */
export interface RetainableEntity {
  readonly id: string;
  readonly entityType: RetainableEntityType;
  readonly userId: string;
  readonly country: string;
  readonly createdAt: Date;
  readonly isArchived: boolean;
}

/**
 * Database operations required by the retention engine.
 * Injected to keep the engine independent of Supabase or any specific DB.
 */
export interface RetentionDatabaseAdapter {
  /** Find entities older than the given date for an entity type */
  findExpiredEntities(params: {
    entityType: RetainableEntityType;
    olderThan: Date;
    limit: number;
  }): Promise<RetainableEntity[]>;

  /** Mark entities as archived (soft-delete / move to archive table) */
  archiveEntities(entityIds: string[], entityType: RetainableEntityType): Promise<void>;

  /**
   * Anonymize entities: replace PII fields with SHA-256 hashes,
   * preserve aggregate/financial data for reporting.
   */
  anonymizeEntities(entityIds: string[], entityType: RetainableEntityType): Promise<void>;

  /** Permanently delete entities */
  deleteEntities(entityIds: string[], entityType: RetainableEntityType): Promise<void>;

  /** Write an entry to the retention_log table */
  writeRetentionLog(entry: Omit<RetentionLogRow, 'id'>): Promise<void>;

  /** Get all active retention schedules that are due */
  getDueSchedules(asOf: Date): Promise<RetentionSchedule[]>;

  /** Update the next run time for a schedule */
  updateScheduleNextRun(policyId: string, nextRunAt: Date): Promise<void>;

  /** Count entities still within retention period for a given type */
  countRetainedEntities(entityType: RetainableEntityType): Promise<number>;
}

/** Logger interface matching the project's structured logger */
export interface RetentionLogger {
  info(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
}

// ─── Configuration ────────────────────────────────────────────────────────────

/** Maximum entities to process in a single batch to avoid memory pressure */
const DEFAULT_BATCH_SIZE = 500;

/** Default interval between scheduled runs (24 hours in ms) */
const DEFAULT_SCHEDULE_INTERVAL_MS = 24 * 60 * 60 * 1000;

// ─── Engine ───────────────────────────────────────────────────────────────────

/**
 * RetentionEngine evaluates and enforces data retention policies.
 *
 * Usage:
 * ```ts
 * const engine = new RetentionEngine({ db: adapter, logger });
 * const result = await engine.processRetentionSchedule();
 * const report = await engine.generateRetentionReport({ periodStart, periodEnd });
 * ```
 */
export class RetentionEngine {
  private readonly db: RetentionDatabaseAdapter;
  private readonly logger: RetentionLogger;
  private readonly batchSize: number;
  private readonly executedBy: string;

  constructor(params: {
    db: RetentionDatabaseAdapter;
    logger: RetentionLogger;
    batchSize?: number;
    executedBy?: string;
  }) {
    this.db = params.db;
    this.logger = params.logger;
    this.batchSize = params.batchSize ?? DEFAULT_BATCH_SIZE;
    this.executedBy = params.executedBy ?? 'retention-engine';
  }

  /**
   * Evaluate which entities have exceeded their retention period
   * for a specific policy.
   *
   * @param policy - The retention policy to evaluate
   * @returns Array of entities that are past retention
   */
  async evaluateRetention(policy: RetentionPolicy): Promise<RetainableEntity[]> {
    if (policy.retentionDays <= 0) {
      this.logger.info('Policy has zero retention days (on-request only), skipping time-based evaluation', {
        policyId: policy.id,
        jurisdiction: policy.jurisdiction,
      });
      return [];
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);

    this.logger.info('Evaluating retention', {
      policyId: policy.id,
      entityType: policy.entityType,
      cutoffDate: cutoffDate.toISOString(),
      retentionDays: policy.retentionDays,
    });

    try {
      const expired = await this.db.findExpiredEntities({
        entityType: policy.entityType,
        olderThan: cutoffDate,
        limit: this.batchSize,
      });

      this.logger.info('Retention evaluation complete', {
        policyId: policy.id,
        expiredCount: expired.length,
      });

      return expired;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to evaluate retention', {
        policyId: policy.id,
        error: message,
      });
      throw error;
    }
  }

  /**
   * Archive entities: move to archive storage and mark as archived.
   * All actions are audit-logged.
   *
   * @param entityIds - IDs of entities to archive
   * @param entityType - The entity type being archived
   * @returns Partial RetentionResult with archive counts
   */
  async archive(
    entityIds: readonly string[],
    entityType: RetainableEntityType,
  ): Promise<RetentionResult> {
    return this.executeAction([...entityIds], entityType, 'archive', async (ids) => {
      await this.db.archiveEntities(ids, entityType);
    });
  }

  /**
   * Anonymize entities: replace PII with SHA-256 hashes while
   * preserving aggregate financial data for reporting.
   *
   * @param entityIds - IDs of entities to anonymize
   * @param entityType - The entity type being anonymized
   * @returns Partial RetentionResult with anonymization counts
   */
  async anonymize(
    entityIds: readonly string[],
    entityType: RetainableEntityType,
  ): Promise<RetentionResult> {
    return this.executeAction([...entityIds], entityType, 'anonymize', async (ids) => {
      await this.db.anonymizeEntities(ids, entityType);
    });
  }

  /**
   * Permanently delete entities that have exceeded their retention period
   * and have already been archived/anonymized.
   *
   * @param entityIds - IDs of entities to delete
   * @param entityType - The entity type being deleted
   * @returns Partial RetentionResult with deletion counts
   */
  async deleteExpired(
    entityIds: readonly string[],
    entityType: RetainableEntityType,
  ): Promise<RetentionResult> {
    return this.executeAction([...entityIds], entityType, 'delete', async (ids) => {
      await this.db.deleteEntities(ids, entityType);
    });
  }

  /**
   * Process all due retention schedules.
   * This is the main entry point for scheduled (cron) execution.
   *
   * @returns Aggregated RetentionResult across all processed schedules
   */
  async processRetentionSchedule(): Promise<RetentionResult> {
    const now = new Date();
    this.logger.info('Starting retention schedule processing', {
      timestamp: now.toISOString(),
    });

    let totalProcessed = 0;
    let totalArchived = 0;
    let totalAnonymized = 0;
    let totalDeleted = 0;
    const allErrors: RetentionError[] = [];

    try {
      const dueSchedules = await this.db.getDueSchedules(now);

      this.logger.info('Found due schedules', { count: dueSchedules.length });

      for (const schedule of dueSchedules) {
        const policy = this.resolvePolicy(schedule.policyId);
        if (!policy) {
          this.logger.warn('Schedule references unknown policy, skipping', {
            policyId: schedule.policyId,
          });
          continue;
        }

        const expired = await this.evaluateRetention(policy);
        if (expired.length === 0) {
          await this.advanceSchedule(schedule.policyId, now);
          continue;
        }

        const ids = expired.map((e) => e.id);
        let result: RetentionResult;

        switch (schedule.action) {
          case 'archive':
            result = await this.archive(ids, schedule.entityType);
            break;
          case 'anonymize':
            result = await this.anonymize(ids, schedule.entityType);
            break;
          case 'delete':
            result = await this.deleteExpired(ids, schedule.entityType);
            break;
          default: {
            const _exhaustive: never = schedule.action;
            throw new Error(`Unknown retention action: ${String(_exhaustive)}`);
          }
        }

        totalProcessed += result.processed;
        totalArchived += result.archived;
        totalAnonymized += result.anonymized;
        totalDeleted += result.deleted;
        allErrors.push(...result.errors);

        await this.advanceSchedule(schedule.policyId, now);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Retention schedule processing failed', { error: message });
      throw error;
    }

    const result: RetentionResult = {
      processed: totalProcessed,
      archived: totalArchived,
      anonymized: totalAnonymized,
      deleted: totalDeleted,
      errors: allErrors,
    };

    this.logger.info('Retention schedule processing complete', {
      processed: result.processed,
      archived: result.archived,
      anonymized: result.anonymized,
      deleted: result.deleted,
      errorCount: result.errors.length,
    });

    return result;
  }

  /**
   * Generate a compliance report for a given reporting period.
   *
   * @param params - Reporting period boundaries
   * @returns Full RetentionReport for regulatory inspection
   */
  async generateRetentionReport(params: {
    periodStart: Date;
    periodEnd: Date;
  }): Promise<RetentionReport> {
    const { periodStart, periodEnd } = params;

    this.logger.info('Generating retention compliance report', {
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    });

    const entityTypes: RetainableEntityType[] = [
      'invoice', 'extraction', 'conversion', 'payment',
      'user', 'audit_log', 'business_correspondence',
    ];

    let totalRetained = 0;
    let totalProcessed = 0;
    const results: Array<RetentionReport['results'][number]> = [];

    for (const policy of RETENTION_POLICIES) {
      const retained = await this.db.countRetainedEntities(policy.entityType);
      totalRetained += retained;

      results.push({
        policyId: policy.id,
        jurisdiction: policy.jurisdiction,
        entityType: policy.entityType,
        result: {
          processed: 0,
          archived: 0,
          anonymized: 0,
          deleted: 0,
          errors: [],
        },
      });
    }

    // Deduplicate entity type counts (policies can overlap across jurisdictions)
    const uniqueRetained = new Set<RetainableEntityType>();
    let deduplicatedRetained = 0;
    for (const et of entityTypes) {
      if (!uniqueRetained.has(et)) {
        uniqueRetained.add(et);
        deduplicatedRetained += await this.db.countRetainedEntities(et);
      }
    }

    const report: RetentionReport = {
      generatedAt: new Date().toISOString(),
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      policiesEvaluated: results.length,
      results,
      entitiesRetained: deduplicatedRetained,
      entitiesProcessed: totalProcessed,
    };

    this.logger.info('Retention report generated', {
      policiesEvaluated: report.policiesEvaluated,
      entitiesRetained: report.entitiesRetained,
    });

    return report;
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Execute a retention action on a batch of entity IDs with full audit logging.
   */
  private async executeAction(
    entityIds: string[],
    entityType: RetainableEntityType,
    action: RetentionAction,
    operation: (ids: string[]) => Promise<void>,
  ): Promise<RetentionResult> {
    const errors: RetentionError[] = [];
    let successCount = 0;

    this.logger.info(`Executing retention action: ${action}`, {
      entityType,
      count: entityIds.length,
    });

    try {
      await operation(entityIds);
      successCount = entityIds.length;

      // Audit log each entity
      for (const entityId of entityIds) {
        await this.db.writeRetentionLog({
          policy_id: 'manual',
          entity_type: entityType,
          entity_id: entityId,
          action,
          status: 'success',
          error_message: null,
          executed_by: this.executedBy,
          executed_at: new Date().toISOString(),
        });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Retention ${action} failed`, {
        entityType,
        error: message,
      });

      for (const entityId of entityIds) {
        errors.push({
          entityId,
          entityType,
          action,
          message,
          occurredAt: new Date().toISOString(),
        });

        await this.db.writeRetentionLog({
          policy_id: 'manual',
          entity_type: entityType,
          entity_id: entityId,
          action,
          status: 'failed',
          error_message: message,
          executed_by: this.executedBy,
          executed_at: new Date().toISOString(),
        });
      }
    }

    return {
      processed: entityIds.length,
      archived: action === 'archive' ? successCount : 0,
      anonymized: action === 'anonymize' ? successCount : 0,
      deleted: action === 'delete' ? successCount : 0,
      errors,
    };
  }

  /** Resolve a policy by ID from the predefined set */
  private resolvePolicy(policyId: string): RetentionPolicy | null {
    return RETENTION_POLICIES.find((p) => p.id === policyId) ?? null;
  }

  /** Advance a schedule's nextRunAt by the default interval */
  private async advanceSchedule(policyId: string, currentRun: Date): Promise<void> {
    const nextRun = new Date(currentRun.getTime() + DEFAULT_SCHEDULE_INTERVAL_MS);
    await this.db.updateScheduleNextRun(policyId, nextRun);
  }
}

/**
 * Hash a PII value with SHA-256 for anonymization.
 * Exported for use by database adapters implementing anonymizeEntities.
 *
 * @param value - The plaintext PII value
 * @returns Hex-encoded SHA-256 hash
 */
export function hashPii(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
