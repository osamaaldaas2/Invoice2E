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

/**
 * Get authenticated and authorized admin user
 * Throws UnauthorizedError if not authenticated
 * Throws ForbiddenError if not admin
 */
export async function requireAdmin(request: NextRequest): Promise<AuthorizedUser> {
    const session = getSessionFromCookie();

    if (!session) {
        logger.warn('Admin access attempted without authentication', {
            path: request.nextUrl.pathname,
            ip: request.headers.get('x-forwarded-for') || 'unknown',
        });
        throw new UnauthorizedError('Authentication required');
    }

    if (!['admin', 'super_admin'].includes(session.role)) {
        logger.warn('Non-admin attempted admin access', {
            userId: session.userId,
            role: session.role,
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
        role: session.role,
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
export function checkAdminAuth(request: NextRequest): AuthorizationResult {
    try {
        const session = getSessionFromCookie();

        if (!session) {
            return { authorized: false, user: null, error: 'Not authenticated' };
        }

        if (!['admin', 'super_admin'].includes(session.role)) {
            return { authorized: false, user: null, error: 'Not an admin' };
        }

        return {
            authorized: true,
            user: {
                id: session.userId,
                email: session.email,
                firstName: session.firstName,
                lastName: session.lastName,
                role: session.role,
            },
        };
    } catch {
        return { authorized: false, user: null, error: 'Authorization check failed' };
    }
}

/**
 * Check if current session has specific role
 */
export function hasRole(roles: UserRole[]): boolean {
    const session = getSessionFromCookie();
    if (!session) return false;
    return roles.includes(session.role);
}

/**
 * Check if current session is admin or super_admin
 */
export function isAdmin(): boolean {
    return hasRole(['admin', 'super_admin']);
}

/**
 * Check if current session is super_admin
 */
export function isSuperAdmin(): boolean {
    return hasRole(['super_admin']);
}

/**
 * Get client IP address from request
 */
export function getClientIp(request: NextRequest): string {
    return (
        request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
        request.headers.get('x-real-ip') ||
        'unknown'
    );
}

/**
 * Get user agent from request
 */
export function getUserAgent(request: NextRequest): string {
    return request.headers.get('user-agent') || 'unknown';
}
