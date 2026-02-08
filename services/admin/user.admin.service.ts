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
    AdminTransaction,
    AdminCreditTransaction,
    AdminConversion,
    AdminBatchJobSummary,
} from '@/types/admin';
import { adminAuditService } from './audit.admin.service';

type UserRow = {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    postal_code?: string | null;
    country?: string | null;
    phone?: string | null;
    tax_id?: string | null;
    language?: string | null;
    role?: string | null;
    is_banned?: boolean | null;
    banned_at?: string | null;
    banned_reason?: string | null;
    last_login_at?: string | null;
    login_count?: number | null;
    created_at: string;
    updated_at: string;
    user_credits?:
        | Array<{ available_credits?: number | null; used_credits?: number | null }>
        | { available_credits?: number | null; used_credits?: number | null }
        | null;
};

type AdminTransactionRow = {
    id: string;
    user_id: string;
    stripe_payment_id?: string | null;
    paypal_order_id?: string | null;
    amount: string;
    currency?: string | null;
    credits_purchased?: number | null;
    payment_method?: string | null;
    payment_status?: string | null;
    created_at: string;
};

type CreditTransactionRow = {
    id: string;
    user_id: string;
    amount: number | string;
    transaction_type: string;
    source: string;
    reference_id?: string | null;
    balance_after?: number | null;
    created_at: string;
};

type ConversionRow = {
    id: string;
    user_id: string;
    extraction_id: string;
    invoice_number?: string | null;
    buyer_name?: string | null;
    conversion_format?: string | null;
    conversion_status?: string | null;
    validation_status?: string | null;
    credits_used?: number | null;
    created_at: string;
    updated_at: string;
};

type BatchJobRow = {
    id: string;
    user_id: string;
    status?: string | null;
    total_files: number;
    completed_files: number;
    failed_files: number;
    created_at: string;
    completed_at?: string | null;
};

class AdminUserService {
    private getSupabase() {
        return createServerClient();
    }

    private resolveCredits(
        credits:
            | Array<{ available_credits?: number | null; used_credits?: number | null }>
            | { available_credits?: number | null; used_credits?: number | null }
            | null
            | undefined
    ): { availableCredits: number; usedCredits: number } {
        if (!credits) {
            return { availableCredits: 0, usedCredits: 0 };
        }

        const entry = Array.isArray(credits) ? credits[0] : credits;
        return {
            availableCredits: entry?.available_credits || 0,
            usedCredits: entry?.used_credits || 0,
        };
    }

    private mapUserRow(row: UserRow): AdminUserWithCredits {
        const resolvedCredits = this.resolveCredits(row.user_credits);
        return {
            id: row.id,
            email: row.email,
            firstName: row.first_name,
            lastName: row.last_name,
            addressLine1: row.address_line1 || undefined,
            addressLine2: row.address_line2 || undefined,
            city: row.city || undefined,
            postalCode: row.postal_code || undefined,
            country: row.country || undefined,
            phone: row.phone || undefined,
            taxId: row.tax_id || undefined,
            language: row.language || undefined,
            role: (row.role || 'user') as AdminUser['role'],
            isBanned: row.is_banned || false,
            bannedAt: row.banned_at ? new Date(row.banned_at) : undefined,
            bannedReason: row.banned_reason || undefined,
            lastLoginAt: row.last_login_at ? new Date(row.last_login_at) : undefined,
            loginCount: row.login_count || 0,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at),
            availableCredits: resolvedCredits.availableCredits,
            usedCredits: resolvedCredits.usedCredits,
        };
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
                id, email, first_name, last_name, address_line1, address_line2,
                city, postal_code, country, phone, tax_id, language, role, is_banned,
                banned_at, banned_reason, last_login_at, login_count,
                created_at, updated_at,
                user_credits(available_credits, used_credits)
            `,
                { count: 'exact' }
            );

        // Apply filters
        if (filters?.search) {
            // FIX-039: Escape SQL wildcards and limit search input length
            const searchTerm = filters.search
                .substring(0, 100)
                .replace(/%/g, '\\%')
                .replace(/_/g, '\\_');
            query = query.or(
                `email.ilike.%${searchTerm}%,first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%`
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
        const users: AdminUserWithCredits[] = (data || []).map((row: UserRow) => this.mapUserRow(row));

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
                id, email, first_name, last_name, address_line1, address_line2,
                city, postal_code, country, phone, tax_id, language, role, is_banned,
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

        return this.mapUserRow(data as UserRow);
    }

    async getUserTransactions(
        userId: string,
        page: number = 1,
        limit: number = 20
    ): Promise<{ items: AdminTransaction[]; total: number }> {
        const supabase = this.getSupabase();
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        const { data, error, count } = await supabase
            .from('payment_transactions')
            .select(
                `
                id, user_id, stripe_payment_id, paypal_order_id,
                amount, currency, credits_purchased, payment_method,
                payment_status, created_at
            `,
                { count: 'exact' }
            )
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) {
            logger.error('Failed to fetch user transactions', { userId, error: error.message });
            throw new AppError('DB_ERROR', 'Failed to fetch user transactions', 500);
        }

        const items: AdminTransaction[] = (data || []).map((row: AdminTransactionRow) => ({
            id: row.id,
            userId: row.user_id,
            userEmail: '',
            userName: '',
            stripePaymentId: row.stripe_payment_id || undefined,
            paypalOrderId: row.paypal_order_id || undefined,
            amount: parseFloat(row.amount) || 0,
            currency: row.currency || 'EUR',
            creditsPurchased: row.credits_purchased || 0,
            paymentMethod: row.payment_method || 'unknown',
            paymentStatus: row.payment_status || 'unknown',
            createdAt: new Date(row.created_at),
        }));

        return { items, total: count || 0 };
    }

    async getUserCreditTransactions(
        userId: string,
        page: number = 1,
        limit: number = 20
    ): Promise<{ items: AdminCreditTransaction[]; total: number }> {
        const supabase = this.getSupabase();
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        const { data, error, count } = await supabase
            .from('credit_transactions')
            .select(
                `
                id, user_id, amount, transaction_type, source,
                reference_id, balance_after, created_at
            `,
                { count: 'exact' }
            )
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) {
            logger.error('Failed to fetch user credit transactions', { userId, error: error.message });
            throw new AppError('DB_ERROR', 'Failed to fetch user credit transactions', 500);
        }

        const items: AdminCreditTransaction[] = (data || []).map((row: CreditTransactionRow) => ({
            id: row.id,
            userId: row.user_id,
            amount: Number(row.amount) || 0,
            transactionType: row.transaction_type,
            source: row.source,
            referenceId: row.reference_id || undefined,
            balanceAfter: row.balance_after || undefined,
            createdAt: new Date(row.created_at),
        }));

        return { items, total: count || 0 };
    }

    async getUserConversions(
        userId: string,
        page: number = 1,
        limit: number = 20
    ): Promise<{ items: AdminConversion[]; total: number }> {
        const supabase = this.getSupabase();
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        const { data, error, count } = await supabase
            .from('invoice_conversions')
            .select(
                `
                id, user_id, extraction_id, invoice_number, buyer_name,
                conversion_format, conversion_status, validation_status,
                credits_used, created_at, updated_at
            `,
                { count: 'exact' }
            )
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) {
            logger.error('Failed to fetch user conversions', { userId, error: error.message });
            throw new AppError('DB_ERROR', 'Failed to fetch user conversions', 500);
        }

        const items: AdminConversion[] = (data || []).map((row: ConversionRow) => ({
            id: row.id,
            userId: row.user_id,
            extractionId: row.extraction_id,
            invoiceNumber: row.invoice_number || undefined,
            buyerName: row.buyer_name || undefined,
            conversionFormat: row.conversion_format || undefined,
            conversionStatus: row.conversion_status || undefined,
            validationStatus: row.validation_status || undefined,
            creditsUsed: row.credits_used || 1,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at),
        }));

        return { items, total: count || 0 };
    }

    async getUserBatchJobs(
        userId: string,
        page: number = 1,
        limit: number = 20
    ): Promise<{ items: AdminBatchJobSummary[]; total: number }> {
        const supabase = this.getSupabase();
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        const { data, error, count } = await supabase
            .from('batch_jobs')
            .select(
                `
                id, user_id, status, total_files, completed_files,
                failed_files, created_at, completed_at
            `,
                { count: 'exact' }
            )
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) {
            logger.error('Failed to fetch user batch jobs', { userId, error: error.message });
            throw new AppError('DB_ERROR', 'Failed to fetch user batch jobs', 500);
        }

        const items: AdminBatchJobSummary[] = (data || []).map((row: BatchJobRow) => ({
            id: row.id,
            userId: row.user_id,
            status: row.status || 'unknown',
            totalFiles: row.total_files || 0,
            completedFiles: row.completed_files || 0,
            failedFiles: row.failed_files || 0,
            createdAt: new Date(row.created_at),
            completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
        }));

        return { items, total: count || 0 };
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
        const { error } = await supabase
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
        const resultBalance = Number(result?.new_balance ?? result?.newBalance);
        let newBalance = Number.isFinite(resultBalance) ? resultBalance : NaN;

        if (!Number.isFinite(newBalance)) {
            const { data: latestCredits, error: latestCreditsError } = await supabase
                .from('user_credits')
                .select('available_credits')
                .eq('user_id', input.userId)
                .single();

            if (latestCreditsError) {
                logger.error('Failed to fetch latest credits after modify', {
                    userId: input.userId,
                    error: latestCreditsError.message,
                });
                newBalance = 0;
            } else {
                newBalance = Number(latestCredits?.available_credits || 0);
            }
        }

        logger.info('Credits modified', {
            userId: input.userId,
            adminId,
            amount: input.amount,
            newBalance,
        });

        return {
            newBalance,
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

        // FIX-006: Use optimistic locking to prevent lost updates from concurrent modifications
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

        // Optimistic lock: only update if credits haven't changed since read
        const { data: updated, error: updateError } = await supabase
            .from('user_credits')
            .update({ available_credits: newCredits })
            .eq('user_id', input.userId)
            .eq('available_credits', oldCredits)
            .select('available_credits')
            .maybeSingle();

        if (updateError) {
            throw new AppError('DB_ERROR', 'Failed to update credits', 500);
        }

        if (!updated) {
            throw new AppError('CONCURRENT_MODIFICATION', 'Credits were modified concurrently. Please retry.', 409);
        }

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
