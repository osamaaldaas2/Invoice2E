/**
 * Admin-specific types for Invoice2E Admin Dashboard
 */

import { UserRole } from './index';

// ============================================
// Admin User Types
// ============================================

export interface AdminUser {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    isBanned: boolean;
    bannedAt?: Date;
    bannedReason?: string;
    lastLoginAt?: Date;
    loginCount: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface AdminUserWithCredits extends AdminUser {
    availableCredits: number;
    usedCredits: number;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    postalCode?: string;
    country?: string;
    phone?: string;
    taxId?: string;
    language?: string;
}

// ============================================
// Admin Audit Log Types
// ============================================

export interface AdminAuditLog {
    id: string;
    adminUserId: string;
    adminEmail?: string;
    adminName?: string;
    targetUserId?: string;
    targetEmail?: string;
    action: string;
    resourceType: 'user' | 'package' | 'transaction' | 'system' | 'credits' | 'voucher';
    resourceId?: string;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    createdAt: Date;
}

export type AdminAction =
    | 'user_banned'
    | 'user_unbanned'
    | 'credits_added'
    | 'credits_removed'
    | 'role_changed'
    | 'package_created'
    | 'package_updated'
    | 'package_deleted'
    | 'transaction_refunded';

// ============================================
// Dashboard Stats Types
// ============================================

export interface AdminDashboardStats {
    totalUsers: number;
    newUsers30d: number;
    bannedUsers: number;
    totalRevenue: number;
    revenue30d: number;
    totalTransactions: number;
    totalConversions: number;
    successfulConversions: number;
    conversions30d: number;
    activePackages: number;
}

export interface RevenueDataPoint {
    date: string;
    revenue: number;
    transactions: number;
}

export interface UserGrowthDataPoint {
    date: string;
    newUsers: number;
    totalUsers: number;
}

export interface ConversionDataPoint {
    date: string;
    conversions: number;
    successful: number;
    failed: number;
}

// ============================================
// Admin Operation Input Types
// ============================================

export interface BanUserInput {
    userId: string;
    reason: string;
}

export interface UnbanUserInput {
    userId: string;
}

export interface ModifyCreditsInput {
    userId: string;
    amount: number; // positive to add, negative to remove
    reason: string;
}

export interface ChangeRoleInput {
    userId: string;
    newRole: UserRole;
}

export interface RefundTransactionInput {
    transactionId: string;
    reason: string;
}

export interface CreatePackageInput {
    slug: string;
    name: string;
    nameDe?: string;
    description?: string;
    descriptionDe?: string;
    credits: number;
    price: number;
    currency?: string;
    isPopular?: boolean;
    savingsPercent?: number;
    sortOrder?: number;
    isActive?: boolean;
}

export interface UpdatePackageInput {
    id: string;
    name?: string;
    nameDe?: string;
    description?: string;
    descriptionDe?: string;
    credits?: number;
    price?: number;
    isPopular?: boolean;
    savingsPercent?: number;
    sortOrder?: number;
    isActive?: boolean;
}

// ============================================
// Admin API Response Types
// ============================================

export interface AdminUsersListResponse {
    users: AdminUserWithCredits[];
    total: number;
    page: number;
    limit: number;
}

export interface AdminAuditLogsResponse {
    logs: AdminAuditLog[];
    total: number;
    page: number;
    limit: number;
}

export interface AdminTransactionsResponse {
    transactions: AdminTransaction[];
    total: number;
    page: number;
    limit: number;
}

export interface AdminTransaction {
    id: string;
    userId: string;
    userEmail: string;
    userName: string;
    stripePaymentId?: string;
    paypalOrderId?: string;
    amount: number;
    currency: string;
    creditsPurchased: number;
    paymentMethod: string;
    paymentStatus: string;
    createdAt: Date;
}

export interface AdminCreditTransaction {
    id: string;
    userId: string;
    amount: number;
    transactionType: string;
    source: string;
    referenceId?: string;
    balanceAfter?: number;
    createdAt: Date;
}

export interface AdminConversion {
    id: string;
    userId: string;
    extractionId: string;
    invoiceNumber?: string;
    buyerName?: string;
    conversionFormat?: string;
    conversionStatus?: string;
    validationStatus?: string;
    creditsUsed: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface AdminBatchJobSummary {
    id: string;
    userId: string;
    status: string;
    totalFiles: number;
    completedFiles: number;
    failedFiles: number;
    createdAt: Date;
    completedAt?: Date;
}

// ============================================
// Admin Filter Types
// ============================================

export interface AdminUsersFilter {
    search?: string;
    role?: UserRole;
    isBanned?: boolean;
    sortBy?: 'created_at' | 'email' | 'last_login_at' | 'credits';
    sortOrder?: 'asc' | 'desc';
}

export interface AdminAuditLogsFilter {
    adminUserId?: string;
    targetUserId?: string;
    action?: AdminAction;
    resourceType?: string;
    startDate?: string;
    endDate?: string;
}

export interface AdminTransactionsFilter {
    userId?: string;
    status?: string;
    paymentMethod?: string;
    startDate?: string;
    endDate?: string;
}
