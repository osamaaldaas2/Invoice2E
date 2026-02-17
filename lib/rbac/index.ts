/**
 * RBAC Module Entry Point
 * Exports the ability builder, role definitions, types, and helper functions.
 */

export { buildAbility } from './abilities';
export type { AppAbility } from './abilities';
export { ROLES, getRoleDefinition, ADMIN_ROLE, USER_ROLE, ACCOUNTANT_ROLE, SUPER_ADMIN_ROLE } from './roles';
export type { Role, Action, Subject, Permission, RoleDefinition, RbacUser } from './types';

import { buildAbility } from './abilities';
import type { Action, Subject, RbacUser } from './types';
import { ForbiddenError } from '@/lib/errors';

/**
 * Check if a user can perform an action on a subject.
 *
 * @param user - User context for permission check
 * @param action - The action to check
 * @param subject - The subject/resource to check against
 * @returns true if the user has the permission
 *
 * @example
 * ```ts
 * if (can(user, 'read', 'Invoice')) { ... }
 * ```
 */
export function can(user: RbacUser, action: Action, subject: Subject): boolean {
  const ability = buildAbility(user);
  return ability.can(action, subject);
}

/**
 * Check if a user cannot perform an action on a subject.
 *
 * @param user - User context for permission check
 * @param action - The action to check
 * @param subject - The subject/resource to check against
 * @returns true if the user does NOT have the permission
 */
export function cannot(user: RbacUser, action: Action, subject: Subject): boolean {
  return !can(user, action, subject);
}

/**
 * Assert that a user can perform an action, throwing ForbiddenError if not.
 *
 * @param user - User context for permission check
 * @param action - The action to assert
 * @param subject - The subject/resource to assert against
 * @throws ForbiddenError if the user lacks the required permission
 */
export function assertCan(user: RbacUser, action: Action, subject: Subject): void {
  if (cannot(user, action, subject)) {
    throw new ForbiddenError(
      `Permission denied: cannot ${action} ${subject}`
    );
  }
}
