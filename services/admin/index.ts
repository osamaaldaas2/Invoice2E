/**
 * Admin Services Index
 * Central export for all admin-related services
 */

export { adminAuditService } from './audit.admin.service';
export { adminUserService } from './user.admin.service';
export { adminStatsService } from './stats.admin.service';
export { adminTransactionService } from './transaction.admin.service';

// Re-export types for convenience
export type {
    AdminUser,
    AdminUserWithCredits,
    AdminAuditLog,
    AdminDashboardStats,
    AdminTransaction,
    AdminUsersFilter,
    AdminAuditLogsFilter,
    AdminTransactionsFilter,
    BanUserInput,
    ModifyCreditsInput,
    ChangeRoleInput,
    RefundTransactionInput,
} from '@/types/admin';
