/**
 * FIX: Audit #097 — verify audit log hash chain integrity.
 * GET /api/admin/audit/verify — checks the hash chain of the main audit_logs table.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/authorization';
import { createAdminClient } from '@/lib/supabase.server';
import { verifyChainIntegrity, type AuditChainEntry } from '@/lib/audit-hash';
import { logger } from '@/lib/logger';
import { handleApiError } from '@/lib/api-helpers';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireSuperAdmin(request);

    const supabase = createAdminClient();

    // Fetch recent audit logs ordered for chain verification
    const { data, error } = await supabase
      .from('audit_logs')
      .select(
        'id, action, resource_type, resource_id, user_id, changes, created_at, entry_hash, prev_hash'
      )
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(1000);

    if (error) {
      logger.error('Failed to fetch audit logs for verification', { error: error.message });
      return NextResponse.json({ success: false, error: 'Failed to fetch logs' }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ success: true, data: { isValid: true, totalChecked: 0 } });
    }

    // Map DB rows to AuditChainEntry
    const entries: AuditChainEntry[] = data.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      action: row.action as string,
      resourceType: row.resource_type as string | null,
      resourceId: row.resource_id as string | null,
      userId: row.user_id as string | null,
      changes: row.changes as Record<string, unknown> | null,
      createdAt: row.created_at as string,
      entryHash: row.entry_hash as string,
      prevHash: row.prev_hash as string | null,
    }));

    const result = await verifyChainIntegrity(entries);

    if (!result.isValid) {
      // FIX: Audit #097 — log integrity violation
      logger.error('AUDIT LOG INTEGRITY VIOLATION', {
        firstBrokenId: result.firstBrokenId,
        error: result.error,
        totalChecked: result.totalChecked,
        audit: '#097',
      });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return handleApiError(error, 'Audit chain verification error', {
      message: 'Failed to verify audit chain',
      includeSuccess: true,
    });
  }
}
