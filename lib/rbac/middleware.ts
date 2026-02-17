/**
 * RBAC Authorization Middleware
 * Provides an authorize() function that checks CASL abilities before route execution.
 */

import { NextRequest } from 'next/server';
import { getSessionFromCookie } from '@/lib/session';
import { ForbiddenError, UnauthorizedError } from '@/lib/errors';
import { buildAbility } from './abilities';
import type { AppAbility } from './abilities';
import type { Action, Subject, RbacUser, Role } from './types';
import { logger } from '@/lib/logger';
import { createServerClient } from '@/lib/supabase.server';

/**
 * Result of a successful authorization check.
 * Contains the authenticated user and their CASL ability instance.
 */
export interface AuthorizedContext {
  user: RbacUser;
  ability: AppAbility;
}

/**
 * Load the live role from the database to prevent stale session data.
 *
 * @param userId - The user ID to look up
 * @returns The user's current role, or null if not found
 */
async function getLiveRole(userId: string): Promise<Role | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('users')
    .select('role, is_banned')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) {
    logger.warn('RBAC: Failed to load live role', { userId, error: error?.message });
    return null;
  }

  if (data.is_banned) {
    logger.warn('RBAC: Banned user attempted access', { userId });
    return null;
  }

  return (data.role || 'user') as Role;
}

/**
 * Authorize a request, requiring authentication and optionally checking a specific permission.
 * Returns the user context and their CASL ability instance for further checks in the handler.
 *
 * @param request - The incoming Next.js request
 * @param action - Optional action to check immediately
 * @param subject - Optional subject to check immediately (required if action is provided)
 * @returns The authorized user context with CASL ability
 * @throws UnauthorizedError if no valid session exists
 * @throws ForbiddenError if the user lacks the required permission
 *
 * @example
 * ```ts
 * // Just authenticate
 * const { user, ability } = await authorize(request);
 *
 * // Authenticate and check permission
 * const { user, ability } = await authorize(request, 'read', 'Invoice');
 * ```
 */
export async function authorize(
  request: NextRequest,
  action?: Action,
  subject?: Subject,
): Promise<AuthorizedContext> {
  const session = await getSessionFromCookie();

  if (!session) {
    logger.warn('RBAC: Unauthenticated access attempt', {
      path: request.nextUrl.pathname,
      ip: request.headers.get('x-forwarded-for') || 'unknown',
    });
    throw new UnauthorizedError('Authentication required');
  }

  // Load live role from DB to prevent stale session abuse
  const liveRole = await getLiveRole(session.userId);
  if (!liveRole) {
    throw new UnauthorizedError('Authentication required');
  }

  const rbacUser: RbacUser = {
    id: session.userId,
    role: liveRole,
  };

  const ability = buildAbility(rbacUser);

  // If an action+subject pair was specified, check it immediately
  if (action && subject) {
    if (!ability.can(action, subject)) {
      logger.warn('RBAC: Permission denied', {
        userId: session.userId,
        role: liveRole,
        action,
        subject,
        path: request.nextUrl.pathname,
      });
      throw new ForbiddenError(`Permission denied: cannot ${action} ${subject}`);
    }
  }

  logger.info('RBAC: Access granted', {
    userId: session.userId,
    role: liveRole,
    action: action ?? 'auth-only',
    subject: subject ?? 'none',
    path: request.nextUrl.pathname,
  });

  return { user: rbacUser, ability };
}
