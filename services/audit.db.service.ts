import { createAdminClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import { AppError } from '@/lib/errors';
import type { AuditLog } from '@/types';
import { camelToSnakeKeys, snakeToCamelKeys } from '@/lib/database-helpers';
import { computeAuditHash, verifyChainIntegrity } from '@/lib/audit-hash';
import type { AuditChainEntry, ChainVerificationResult } from '@/lib/audit-hash';

export type CreateAuditLogData = {
  userId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  changes?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
};

/** Result returned by the DB verify_audit_chain() function. */
interface DbChainVerifyResult {
  total_checked: number;
  is_valid: boolean;
  first_broken_id: string | null;
  first_broken_expected_hash: string | null;
  first_broken_actual_prev_hash: string | null;
}

export class AuditDatabaseService {
  private getSupabase() {
    return createAdminClient();
  }

  /**
   * Create an immutable audit log entry.
   * The DB trigger computes entry_hash and prev_hash server-side.
   * Client-side hash is computed as a verification backup logged on mismatch.
   */
  async createLog(data: CreateAuditLogData): Promise<void> {
    const supabase = this.getSupabase();
    const snakeData = camelToSnakeKeys(data);

    const { data: inserted, error } = await supabase
      .from('audit_logs')
      .insert([snakeData])
      .select('id, entry_hash, action, resource_type, resource_id, user_id, changes, created_at')
      .single();

    if (error) {
      // Audit log failures should not block operations
      logger.error('Failed to create audit log', { error: error.message });
      return;
    }

    // Client-side verification: recompute hash and warn on mismatch
    if (inserted) {
      try {
        const clientHash = await computeAuditHash({
          action: inserted.action,
          resourceType: inserted.resource_type,
          resourceId: inserted.resource_id,
          userId: inserted.user_id,
          changes: inserted.changes,
          createdAt: inserted.created_at,
        });

        if (clientHash !== inserted.entry_hash) {
          logger.error('Audit hash mismatch: client and DB hashes differ', {
            auditLogId: inserted.id,
            clientHash,
            dbHash: inserted.entry_hash,
          });
        }
      } catch (hashErr) {
        logger.error('Failed to compute client-side audit hash', {
          error: hashErr instanceof Error ? hashErr.message : String(hashErr),
        });
      }
    }
  }

  /**
   * Get audit logs for a specific user.
   *
   * @param userId - The user ID to fetch logs for
   * @param limit - Maximum number of entries to return (default 50)
   */
  async getUserLogs(userId: string, limit: number = 50): Promise<AuditLog[]> {
    const supabase = this.getSupabase();

    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('Failed to get audit logs', { userId, error: error.message });
      throw new AppError('DB_ERROR', 'Failed to fetch audit logs', 500);
    }

    return (data ?? []).map((item: Record<string, unknown>) => snakeToCamelKeys(item) as AuditLog);
  }

  /**
   * Verify the audit log hash chain integrity using the server-side DB function.
   * This is the authoritative check — it runs entirely in PostgreSQL.
   *
   * @param limit - Maximum entries to verify (default 1000)
   * @returns Verification result from the database
   */
  async verifyAuditChain(limit: number = 1000): Promise<{
    totalChecked: number;
    isValid: boolean;
    firstBrokenId: string | null;
    firstBrokenExpectedHash: string | null;
    firstBrokenActualPrevHash: string | null;
  }> {
    const supabase = this.getSupabase();

    const { data, error } = await supabase.rpc('verify_audit_chain', { p_limit: limit });

    if (error) {
      logger.error('Failed to verify audit chain', { error: error.message });
      throw new AppError('DB_ERROR', 'Failed to verify audit chain', 500);
    }

    const row = (data as DbChainVerifyResult[])?.[0];
    if (!row) {
      throw new AppError('DB_ERROR', 'No result from verify_audit_chain', 500);
    }

    return {
      totalChecked: row.total_checked,
      isValid: row.is_valid,
      firstBrokenId: row.first_broken_id,
      firstBrokenExpectedHash: row.first_broken_expected_hash,
      firstBrokenActualPrevHash: row.first_broken_actual_prev_hash,
    };
  }

  /**
   * Get an ordered audit trail with optional client-side hash verification.
   * Entries are returned in chronological order (oldest first) for chain verification.
   *
   * @param options - Query and verification options
   * @returns Audit entries and optional verification result
   */
  async getAuditTrail(
    options: {
      userId?: string;
      limit?: number;
      verify?: boolean;
    } = {}
  ): Promise<{
    entries: AuditLog[];
    verification: ChainVerificationResult | null;
  }> {
    const { userId, limit = 100, verify = false } = options;
    const supabase = this.getSupabase();

    let query = supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(limit);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Failed to get audit trail', { error: error.message });
      throw new AppError('DB_ERROR', 'Failed to fetch audit trail', 500);
    }

    const entries = (data ?? []).map(
      (item: Record<string, unknown>) => snakeToCamelKeys(item) as AuditLog
    );

    let verification: ChainVerificationResult | null = null;

    if (verify && entries.length > 0) {
      const chainEntries: AuditChainEntry[] = entries.map((e) => ({
        id: e.id,
        action: e.action,
        resourceType: e.resourceType,
        resourceId: e.resourceId,
        userId: e.userId,
        changes: e.changes,
        createdAt: e.createdAt,
        entryHash: e.entryHash,
        prevHash: e.prevHash,
      }));

      verification = await verifyChainIntegrity(chainEntries);
    }

    return { entries, verification };
  }
}

export const auditDbService = new AuditDatabaseService();
