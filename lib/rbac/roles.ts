/**
 * Role Definitions for Invoice2E RBAC System
 * Defines ADMIN, USER, ACCOUNTANT, and SUPER_ADMIN roles with descriptions and permissions.
 */

import type { RoleDefinition } from './types';

/** Admin role — full system management */
export const ADMIN_ROLE: RoleDefinition = {
  key: 'admin',
  name: 'Administrator',
  description: 'Full access to all resources. Can manage users, invoices, credits, and audit logs.',
  permissions: [
    { action: 'manage', subject: 'all' },
  ],
};

/** Super Admin role — inherits admin, reserved for dangerous operations */
export const SUPER_ADMIN_ROLE: RoleDefinition = {
  key: 'super_admin',
  name: 'Super Administrator',
  description: 'Elevated administrator with access to destructive operations like refunds and role changes.',
  permissions: [
    { action: 'manage', subject: 'all' },
  ],
};

/** User role — standard authenticated user */
export const USER_ROLE: RoleDefinition = {
  key: 'user',
  name: 'User',
  description: 'Standard user. Can create, read, update, and delete own invoices. Read own credits and audit logs.',
  permissions: [
    { action: ['create', 'read', 'update', 'delete'], subject: 'Invoice', conditions: { userId: '{{id}}' } },
    { action: ['create', 'read', 'update', 'delete'], subject: 'InvoiceConversion', conditions: { userId: '{{id}}' } },
    { action: 'read', subject: 'Credit', conditions: { userId: '{{id}}' } },
    { action: 'read', subject: 'AuditLog', conditions: { userId: '{{id}}' } },
    { action: 'read', subject: 'User', conditions: { id: '{{id}}' } },
    { action: 'update', subject: 'User', conditions: { id: '{{id}}' } },
  ],
};

/** Accountant role — read and convert invoices for assigned organization */
export const ACCOUNTANT_ROLE: RoleDefinition = {
  key: 'accountant',
  name: 'Accountant',
  description: 'Can read and convert invoices for their assigned organization. Read-only access to credits.',
  permissions: [
    { action: ['read', 'convert'], subject: 'Invoice', conditions: { organizationId: '{{organizationId}}' } },
    { action: ['read', 'convert'], subject: 'InvoiceConversion', conditions: { organizationId: '{{organizationId}}' } },
    { action: 'read', subject: 'Credit', conditions: { organizationId: '{{organizationId}}' } },
  ],
};

/** All role definitions indexed by role key */
export const ROLES: Record<string, RoleDefinition> = {
  user: USER_ROLE,
  admin: ADMIN_ROLE,
  super_admin: SUPER_ADMIN_ROLE,
  accountant: ACCOUNTANT_ROLE,
};

/**
 * Get a role definition by key.
 * @param role - The role key to look up
 * @returns The role definition, or undefined if not found
 */
export function getRoleDefinition(role: string): RoleDefinition | undefined {
  return ROLES[role];
}
