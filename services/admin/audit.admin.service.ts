/**
 * Admin Audit Service
 * Handles logging and retrieval of admin actions for audit trail
 */

import { createServerClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import { AppError } from '@/lib/errors';
import { AdminAuditLog, AdminAuditLogsFilter, AdminAction } from '@/types/admin';

interface LogAdminActionParams {
    adminUserId: string;
    targetUserId?: string;
    action: AdminAction | string;
    resourceType: 'user' | 'package' | 'transaction' | 'system' | 'credits' | 'voucher';
    resourceId?: string;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
}

class AdminAuditService {
    private getSupabase() {
        return createServerClient();
    }

    /**
     * Log an admin action for audit trail
     */
    async logAdminAction(params: LogAdminActionParams): Promise<string> {
        try {
            const supabase = this.getSupabase();

            const { data, error } = await supabase
                .from('admin_audit_logs')
                .insert([
                    {
                        admin_user_id: params.adminUserId,
                        target_user_id: params.targetUserId || null,
                        action: params.action,
                        resource_type: params.resourceType,
                        resource_id: params.resourceId || null,
                        old_values: params.oldValues || null,
                        new_values: params.newValues || null,
                        ip_address: params.ipAddress || null,
                        user_agent: params.userAgent || null,
                    },
                ])
                .select('id')
                .single();

            if (error) {
                logger.error('Failed to log admin action', { error: error.message, params });
                throw new AppError('AUDIT_LOG_ERROR', 'Failed to log admin action', 500);
            }

            logger.info('Admin action logged', {
                auditLogId: data.id,
                adminUserId: params.adminUserId,
                action: params.action,
                resourceType: params.resourceType,
            });

            return data.id;
        } catch (error) {
            // Don't fail the operation if audit logging fails, but log the error
            logger.error('Audit logging error', { error, params });
            return ''; // Return empty string to indicate logging failed
        }
    }

    /**
     * Get paginated audit logs with optional filters
     */
    async getAuditLogs(
        page: number = 1,
        limit: number = 50,
        filters?: AdminAuditLogsFilter
    ): Promise<{ logs: AdminAuditLog[]; total: number }> {
        const supabase = this.getSupabase();

        // Build query
        let query = supabase
            .from('admin_audit_logs')
            .select(
                `
                *,
                admin:users!admin_user_id(email, first_name, last_name),
                target:users!target_user_id(email, first_name, last_name)
            `,
                { count: 'exact' }
            )
            .order('created_at', { ascending: false });

        // Apply filters
        if (filters?.adminUserId) {
            query = query.eq('admin_user_id', filters.adminUserId);
        }
        if (filters?.targetUserId) {
            query = query.eq('target_user_id', filters.targetUserId);
        }
        if (filters?.action) {
            query = query.eq('action', filters.action);
        }
        if (filters?.resourceType) {
            query = query.eq('resource_type', filters.resourceType);
        }
        if (filters?.startDate) {
            query = query.gte('created_at', filters.startDate);
        }
        if (filters?.endDate) {
            query = query.lte('created_at', filters.endDate);
        }

        // Pagination
        const from = (page - 1) * limit;
        const to = from + limit - 1;
        query = query.range(from, to);

        const { data, error, count } = await query;

        if (error) {
            logger.error('Failed to fetch audit logs', { error: error.message });
            throw new AppError('DB_ERROR', 'Failed to fetch audit logs', 500);
        }

        // Transform data
        const logs: AdminAuditLog[] = (data || []).map((row: any) => ({
            id: row.id,
            adminUserId: row.admin_user_id,
            adminEmail: row.admin?.email,
            adminName: row.admin
                ? [row.admin.first_name, row.admin.last_name].filter(Boolean).join(' ') || undefined
                : undefined, targetUserId: row.target_user_id,
            targetEmail: row.target?.email,
            action: row.action,
            resourceType: row.resource_type,
            resourceId: row.resource_id,
            oldValues: row.old_values,
            newValues: row.new_values,
            ipAddress: row.ip_address,
            userAgent: row.user_agent,
            createdAt: new Date(row.created_at),
        }));

        return {
            logs,
            total: count || 0,
        };
    }

    /**
     * Get audit logs for a specific user (as target)
     */
    async getLogsForUser(userId: string): Promise<AdminAuditLog[]> {
        const { logs } = await this.getAuditLogs(1, 100, { targetUserId: userId });
        return logs;
    }

    /**
     * Get audit logs by a specific admin
     */
    async getLogsByAdmin(adminId: string): Promise<AdminAuditLog[]> {
        const { logs } = await this.getAuditLogs(1, 100, { adminUserId: adminId });
        return logs;
    }
}

export const adminAuditService = new AdminAuditService();
