/**
 * CASL Ability Definitions
 * Builds CASL abilities from role definitions for runtime permission checks.
 */

import { AbilityBuilder, PureAbility, createMongoAbility } from '@casl/ability';
import type { Action, Subject, RbacUser } from './types';
import { getRoleDefinition } from './roles';
import { logger } from '@/lib/logger';

/** CASL ability type used throughout the application */
export type AppAbility = PureAbility<[Action, Subject]>;

/**
 * Build a CASL ability instance for a given user based on their role.
 * Replaces template placeholders (e.g. `{{id}}`) with actual user values.
 *
 * @param user - The user context containing id, role, and optional organizationId
 * @returns A CASL PureAbility instance with the user's permissions
 * @throws Error if the user's role is not recognized
 *
 * @example
 * ```ts
 * const ability = buildAbility({ id: '123', role: 'user' });
 * ability.can('read', 'Invoice'); // true (with conditions)
 * ```
 */
export function buildAbility(user: RbacUser): AppAbility {
  const roleDef = getRoleDefinition(user.role);

  if (!roleDef) {
    logger.error('Unknown role encountered in RBAC ability builder', { role: user.role, userId: user.id });
    // Return empty ability — no permissions
    const { build } = new AbilityBuilder<AppAbility>(createMongoAbility);
    return build();
  }

  const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

  for (const permission of roleDef.permissions) {
    const resolvedConditions = permission.conditions
      ? resolveConditions(permission.conditions, user)
      : undefined;

    const actions = Array.isArray(permission.action) ? permission.action : [permission.action];

    for (const action of actions) {
      if (permission.inverted) {
        cannot(action, permission.subject);
      } else if (resolvedConditions) {
        can(action, permission.subject, resolvedConditions);
      } else {
        can(action, permission.subject);
      }
    }
  }

  return build();
}

/**
 * Resolve template placeholders in conditions with actual user values.
 * Supports `{{id}}` and `{{organizationId}}`.
 *
 * @param conditions - Conditions object with possible template strings
 * @param user - User context for value substitution
 * @returns Resolved conditions with actual values
 */
function resolveConditions(
  conditions: Record<string, unknown>,
  user: RbacUser,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(conditions)) {
    if (value === '{{id}}') {
      resolved[key] = user.id;
    } else if (value === '{{organizationId}}') {
      resolved[key] = user.organizationId ?? null;
    } else {
      resolved[key] = value;
    }
  }

  return resolved;
}
