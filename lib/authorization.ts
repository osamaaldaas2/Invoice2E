/**
 * Authorization Library for Admin System
 * Provides role-based access control functions
 *
 * Usage:
 *   const admin = await requireAdmin(request);
 *   const superAdmin = await requireSuperAdmin(request);
 */

import { NextRequest } from 'next/server';
import { getSessionFromCookie, UserRole } from '@/lib/session';
import { createServerClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import { ForbiddenError, UnauthorizedError } from '@/lib/errors';

// Re-export UserRole for convenience
export type { UserRole };

/**
 * Authorized user object returned after successful authorization
 */
export interface AuthorizedUser {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
}

/**
 * Authorization result for checking without throwing
 */
export interface AuthorizationResult {
    authorized: boolean;
    user: AuthorizedUser | null;
    error?: string;
}

type LiveAdminState = {
    role: UserRole;
    isBanned: boolean;
} | null;

async function getLiveAdminState(userId: string): Promise<LiveAdminState> {
    const supabase = createServerClient();
    const { data, error } = await supabase
        .from('users')
        .select('role, is_banned')
        .eq('id', userId)
        .maybeSingle();

    if (error || !data) {
        logger.warn('Failed to load live authorization state', {
            userId,
            error: error?.message,
        });
        return null;
    }

    return {
        role: (data.role || 'user') as UserRole,
        isBanned: Boolean(data.is_banned),
    };
}

/**
 * Get authenticated and authorized admin user
 * Throws UnauthorizedError if not authenticated
 * Throws ForbiddenError if not admin
 */
export async function requireAdmin(request: NextRequest): Promise<AuthorizedUser> {
    const session = await getSessionFromCookie();

    if (!session) {
        logger.warn('Admin access attempted without authentication', {
            path: request.nextUrl.pathname,
            ip: request.headers.get('x-forwarded-for') || 'unknown',
        });
        throw new UnauthorizedError('Authentication required');
    }

    const liveState = await getLiveAdminState(session.userId);
    if (!liveState) {
        throw new UnauthorizedError('Authentication required');
    }

    if (liveState.isBanned) {
        logger.warn('Banned user attempted admin access', {
            userId: session.userId,
            path: request.nextUrl.pathname,
        });
        throw new ForbiddenError('Account is banned');
    }

    if (!['admin', 'super_admin'].includes(liveState.role)) {
        logger.warn('Non-admin attempted admin access', {
            userId: session.userId,
            role: liveState.role,
            path: request.nextUrl.pathname,
        });
        throw new ForbiddenError('Admin access required');
    }

    logger.info('Admin access granted', {
        userId: session.userId,
        role: session.role,
        path: request.nextUrl.pathname,
    });

    return {
        id: session.userId,
        email: session.email,
        firstName: session.firstName,
        lastName: session.lastName,
        role: liveState.role,
    };
}

/**
 * Require super admin for dangerous operations
 * (refunds, deleting packages, changing roles)
 */
export async function requireSuperAdmin(request: NextRequest): Promise<AuthorizedUser> {
    const admin = await requireAdmin(request);

    if (admin.role !== 'super_admin') {
        logger.warn('Non-super-admin attempted super-admin action', {
            userId: admin.id,
            role: admin.role,
            path: request.nextUrl.pathname,
        });
        throw new ForbiddenError('Super admin access required');
    }

    return admin;
}

/**
 * Check authorization without throwing
 * Useful for conditional logic
 */
export async function checkAdminAuth(request: NextRequest): Promise<AuthorizationResult> {
    void request;
    try {
        return await checkAdminAuthInternal();
    } catch {
        return { authorized: false, user: null, error: 'Authorization check failed' };
    }
}

async function checkAdminAuthInternal(): Promise<AuthorizationResult> {
    const session = await getSessionFromCookie();

    if (!session) {
        return { authorized: false, user: null, error: 'Not authenticated' };
    }

    const liveState = await getLiveAdminState(session.userId);
    if (!liveState) {
        return { authorized: false, user: null, error: 'Authentication required' };
    }
    if (liveState.isBanned) {
        return { authorized: false, user: null, error: 'Account is banned' };
    }
    if (!['admin', 'super_admin'].includes(liveState.role)) {
        return { authorized: false, user: null, error: 'Not an admin' };
    }

    return {
        authorized: true,
        user: {
            id: session.userId,
            email: session.email,
            firstName: session.firstName,
            lastName: session.lastName,
            role: liveState.role,
        },
    };
}

/**
 * Check if current session has specific role
 */
export async function hasRole(roles: UserRole[]): Promise<boolean> {
    const session = await getSessionFromCookie();
    if (!session) return false;
    const liveState = await getLiveAdminState(session.userId);
    if (!liveState || liveState.isBanned) return false;
    return roles.includes(liveState.role);
}

/**
 * Check if current session is admin or super_admin
 */
export async function isAdmin(): Promise<boolean> {
    return hasRole(['admin', 'super_admin']);
}

/**
 * Check if current session is super_admin
 */
export async function isSuperAdmin(): Promise<boolean> {
    return hasRole(['super_admin']);
}

/**
 * Get client IP address from request
 */
export function getClientIp(request: NextRequest): string {
    const forwardedFor = request.headers.get('x-forwarded-for');
    const forwardedIp = forwardedFor?.split(',')[0]?.trim();
    return forwardedIp || request.headers.get('x-real-ip') || 'unknown';
}

/**
 * Get user agent from request
 */
export function getUserAgent(request: NextRequest): string {
    return request.headers.get('user-agent') || 'unknown';
}
