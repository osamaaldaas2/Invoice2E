import { createServerClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import { AppError } from '@/lib/errors';
import type { AuditLog } from '@/types';
import { camelToSnakeKeys, snakeToCamelKeys } from '@/lib/database-helpers';
import { CreateAuditLogData } from './types';

export class AuditService {
    private getSupabase() {
        return createServerClient();
    }

    async createAuditLog(data: CreateAuditLogData): Promise<void> {
        const supabase = this.getSupabase();
        const snakeData = camelToSnakeKeys(data);

        const { error } = await supabase.from('audit_logs').insert([snakeData]);

        if (error) {
            // Audit log failures should not block operations
            logger.error('Failed to create audit log', { error: error.message });
        }
    }

    async getUserAuditLogs(userId: string, limit: number = 50): Promise<AuditLog[]> {
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
}

export const auditService = new AuditService();
