/**
 * Admin User Service
 * Handles user management operations for admins
 */

import { createServerClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import { AppError, NotFoundError } from '@/lib/errors';
import {
    AdminUser,
    AdminUserWithCredits,
    AdminUsersFilter,
    BanUserInput,
    ModifyCreditsInput,
    ChangeRoleInput,
} from '@/types/admin';
import { UserRole } from '@/types/index';
import { adminAuditService } from './audit.admin.service';

class AdminUserService {
    private getSupabase() {
        return createServerClient();
    }

    /**
     * Get paginated list of users with credits
     */
    async getAllUsers(
        page: number = 1,
        limit: number = 20,
        filters?: AdminUsersFilter
    ): Promise<{ users: AdminUserWithCredits[]; total: number }> {
        const supabase = this.getSupabase();

        // Build query
        let query = supabase
            .from('users')
            .select(
                `
                id, email, first_name, last_name, role, is_banned,
                banned_at, banned_reason, last_login_at, login_count,
                created_at, updated_at,
                user_credits(available_credits, used_credits)
            `,
                { count: 'exact' }
            );

        // Apply filters
        if (filters?.search) {
            query = query.or(
                `email.ilike.%${filters.search}%,first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%`
            );
        }
        if (filters?.role) {
            query = query.eq('role', filters.role);
        }
        if (filters?.isBanned !== undefined) {
            query = query.eq('is_banned', filters.isBanned);
        }

        // Sorting
        const sortBy = filters?.sortBy || 'created_at';
        const sortOrder = filters?.sortOrder === 'asc' ? true : false;
        query = query.order(sortBy, { ascending: sortOrder });

        // Pagination
        const from = (page - 1) * limit;
        const to = from + limit - 1;
        query = query.range(from, to);

        const { data, error, count } = await query;

        if (error) {
            logger.error('Failed to fetch users', { error: error.message });
            throw new AppError('DB_ERROR', 'Failed to fetch users', 500);
        }

        // Transform data
        const users: AdminUserWithCredits[] = (data || []).map((row) => ({
            id: row.id,
            email: row.email,
            firstName: row.first_name,
            lastName: row.last_name,
            role: row.role || 'user',
            isBanned: row.is_banned || false,
            bannedAt: row.banned_at ? new Date(row.banned_at) : undefined,
            bannedReason: row.banned_reason,
            lastLoginAt: row.last_login_at ? new Date(row.last_login_at) : undefined,
            loginCount: row.login_count || 0,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at),
            availableCredits: row.user_credits?.[0]?.available_credits || 0,
            usedCredits: row.user_credits?.[0]?.used_credits || 0,
        }));

        return {
            users,
            total: count || 0,
        };
    }

    /**
     * Get user by ID with credits
     */
    async getUserById(userId: string): Promise<AdminUserWithCredits> {
        const supabase = this.getSupabase();

        const { data, error } = await supabase
            .from('users')
            .select(
                `
                id, email, first_name, last_name, role, is_banned,
                banned_at, banned_reason, last_login_at, login_count,
                created_at, updated_at,
                user_credits(available_credits, used_credits)
            `
            )
            .eq('id', userId)
            .single();

        if (error || !data) {
            logger.error('User not found', { userId, error: error?.message });
            throw new NotFoundError('User not found');
        }

        return {
            id: data.id,
            email: data.email,
            firstName: data.first_name,
            lastName: data.last_name,
            role: data.role || 'user',
            isBanned: data.is_banned || false,
            bannedAt: data.banned_at ? new Date(data.banned_at) : undefined,
            bannedReason: data.banned_reason,
            lastLoginAt: data.last_login_at ? new Date(data.last_login_at) : undefined,
            loginCount: data.login_count || 0,
            createdAt: new Date(data.created_at),
            updatedAt: new Date(data.updated_at),
            availableCredits: data.user_credits?.[0]?.available_credits || 0,
            usedCredits: data.user_credits?.[0]?.used_credits || 0,
        };
    }

    /**
     * Ban a user
     */
    async banUser(
        input: BanUserInput,
        adminId: string,
        ipAddress?: string,
        userAgent?: string
    ): Promise<AdminUser> {
        const supabase = this.getSupabase();

        // Get current state
        const user = await this.getUserById(input.userId);
        if (user.isBanned) {
            throw new AppError('ALREADY_BANNED', 'User is already banned', 400);
        }

        // Update user
        const { data, error } = await supabase
            .from('users')
            .update({
                is_banned: true,
                banned_at: new Date().toISOString(),
                banned_reason: input.reason,
            })
            .eq('id', input.userId)
            .select()
            .single();

        if (error) {
            logger.error('Failed to ban user', { error: error.message, userId: input.userId });
            throw new AppError('DB_ERROR', 'Failed to ban user', 500);
        }

        // Audit log
        await adminAuditService.logAdminAction({
            adminUserId: adminId,
            targetUserId: input.userId,
            action: 'user_banned',
            resourceType: 'user',
            resourceId: input.userId,
            oldValues: { isBanned: false },
            newValues: { isBanned: true, bannedReason: input.reason },
            ipAddress,
            userAgent,
        });

        logger.info('User banned', { userId: input.userId, adminId, reason: input.reason });

        return {
            ...user,
            isBanned: true,
            bannedAt: new Date(),
            bannedReason: input.reason,
        };
    }

    /**
     * Unban a user
     */
    async unbanUser(
        userId: string,
        adminId: string,
        ipAddress?: string,
        userAgent?: string
    ): Promise<AdminUser> {
        const supabase = this.getSupabase();

        // Get current state
        const user = await this.getUserById(userId);
        if (!user.isBanned) {
            throw new AppError('NOT_BANNED', 'User is not banned', 400);
        }

        // Update user
        const { error } = await supabase
            .from('users')
            .update({
                is_banned: false,
                banned_at: null,
                banned_reason: null,
            })
            .eq('id', userId);

        if (error) {
            logger.error('Failed to unban user', { error: error.message, userId });
            throw new AppError('DB_ERROR', 'Failed to unban user', 500);
        }

        // Audit log
        await adminAuditService.logAdminAction({
            adminUserId: adminId,
            targetUserId: userId,
            action: 'user_unbanned',
            resourceType: 'user',
            resourceId: userId,
            oldValues: { isBanned: true, bannedReason: user.bannedReason },
            newValues: { isBanned: false },
            ipAddress,
            userAgent,
        });

        logger.info('User unbanned', { userId, adminId });

        return {
            ...user,
            isBanned: false,
            bannedAt: undefined,
            bannedReason: undefined,
        };
    }

    /**
     * Modify user credits (add or remove)
     */
    async modifyCredits(
        input: ModifyCreditsInput,
        adminId: string,
        ipAddress?: string,
        userAgent?: string
    ): Promise<{ newBalance: number; auditLogId: string }> {
        const supabase = this.getSupabase();

        // Try to use the RPC function for atomic operation
        const { data, error } = await supabase.rpc('admin_modify_credits', {
            p_admin_id: adminId,
            p_target_user_id: input.userId,
            p_amount: input.amount,
            p_reason: input.reason,
            p_ip_address: ipAddress || null,
            p_user_agent: userAgent || null,
        });

        if (error) {
            logger.error('Failed to modify credits', {
                error: error.message,
                userId: input.userId,
                amount: input.amount,
            });

            // Fallback to manual modification if RPC not available
            return await this.modifyCreditsManual(input, adminId, ipAddress, userAgent);
        }

        const result = data?.[0] || data;
        logger.info('Credits modified', {
            userId: input.userId,
            adminId,
            amount: input.amount,
            newBalance: result?.new_balance,
        });

        return {
            newBalance: result?.new_balance || 0,
            auditLogId: result?.audit_log_id || '',
        };
    }

    /**
     * Manual credit modification (fallback)
     */
    private async modifyCreditsManual(
        input: ModifyCreditsInput,
        adminId: string,
        ipAddress?: string,
        userAgent?: string
    ): Promise<{ newBalance: number; auditLogId: string }> {
        const supabase = this.getSupabase();

        // Get current credits
        const { data: credits, error: fetchError } = await supabase
            .from('user_credits')
            .select('available_credits')
            .eq('user_id', input.userId)
            .single();

        if (fetchError || !credits) {
            throw new NotFoundError('User credits not found');
        }

        const oldCredits = credits.available_credits;
        const newCredits = Math.max(0, oldCredits + input.amount);

        // Update credits
        const { error: updateError } = await supabase
            .from('user_credits')
            .update({ available_credits: newCredits })
            .eq('user_id', input.userId);

        if (updateError) {
            throw new AppError('DB_ERROR', 'Failed to update credits', 500);
        }

        // Log action
        const auditLogId = await adminAuditService.logAdminAction({
            adminUserId: adminId,
            targetUserId: input.userId,
            action: input.amount >= 0 ? 'credits_added' : 'credits_removed',
            resourceType: 'credits',
            resourceId: input.userId,
            oldValues: { availableCredits: oldCredits },
            newValues: { availableCredits: newCredits, change: input.amount, reason: input.reason },
            ipAddress,
            userAgent,
        });

        return { newBalance: newCredits, auditLogId };
    }

    /**
     * Change user role (super_admin only)
     */
    async changeRole(
        input: ChangeRoleInput,
        adminId: string,
        ipAddress?: string,
        userAgent?: string
    ): Promise<AdminUser> {
        const supabase = this.getSupabase();

        // Prevent changing own role
        if (input.userId === adminId) {
            throw new AppError('SELF_ROLE_CHANGE', 'Cannot change your own role', 400);
        }

        // Get current state
        const user = await this.getUserById(input.userId);
        const oldRole = user.role;

        // Update role
        const { error } = await supabase
            .from('users')
            .update({ role: input.newRole })
            .eq('id', input.userId);

        if (error) {
            logger.error('Failed to change role', { error: error.message, userId: input.userId });
            throw new AppError('DB_ERROR', 'Failed to change role', 500);
        }

        // Audit log
        await adminAuditService.logAdminAction({
            adminUserId: adminId,
            targetUserId: input.userId,
            action: 'role_changed',
            resourceType: 'user',
            resourceId: input.userId,
            oldValues: { role: oldRole },
            newValues: { role: input.newRole },
            ipAddress,
            userAgent,
        });

        logger.info('User role changed', {
            userId: input.userId,
            adminId,
            oldRole,
            newRole: input.newRole,
        });

        return {
            ...user,
            role: input.newRole,
        };
    }
}

export const adminUserService = new AdminUserService();
