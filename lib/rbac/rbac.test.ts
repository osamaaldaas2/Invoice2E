/**
 * RBAC Unit Tests
 * Tests CASL ability definitions for each role: ADMIN, SUPER_ADMIN, USER, ACCOUNTANT.
 */

import { describe, it, expect } from 'vitest';
import { buildAbility } from './abilities';
import { can, cannot, assertCan } from './index';
import { getRoleDefinition, ROLES } from './roles';
import type { RbacUser } from './types';
import { ForbiddenError } from '@/lib/errors';

// ─── Test Users ───────────────────────────────────────────────────────────────

const adminUser: RbacUser = { id: 'admin-1', role: 'admin' };
const superAdminUser: RbacUser = { id: 'super-1', role: 'super_admin' };
const regularUser: RbacUser = { id: 'user-1', role: 'user' };
const accountantUser: RbacUser = { id: 'acc-1', role: 'accountant', organizationId: 'org-1' };
const unknownRoleUser: RbacUser = { id: 'unknown-1', role: 'unknown' as RbacUser['role'] };

// ─── Role Definitions ─────────────────────────────────────────────────────────

describe('Role Definitions', () => {
  it('should have all four roles defined', () => {
    expect(ROLES).toHaveProperty('user');
    expect(ROLES).toHaveProperty('admin');
    expect(ROLES).toHaveProperty('super_admin');
    expect(ROLES).toHaveProperty('accountant');
  });

  it('should return role definition by key', () => {
    const userRole = getRoleDefinition('user');
    expect(userRole).toBeDefined();
    expect(userRole!.key).toBe('user');
    expect(userRole!.name).toBe('User');
  });

  it('should return undefined for unknown role', () => {
    expect(getRoleDefinition('nonexistent')).toBeUndefined();
  });

  it('each role should have permissions array', () => {
    for (const role of Object.values(ROLES)) {
      expect(Array.isArray(role.permissions)).toBe(true);
      expect(role.permissions.length).toBeGreaterThan(0);
    }
  });
});

// ─── Admin Abilities ──────────────────────────────────────────────────────────

describe('Admin Abilities', () => {
  it('should manage all resources', () => {
    const ability = buildAbility(adminUser);
    expect(ability.can('manage', 'all')).toBe(true);
    expect(ability.can('create', 'Invoice')).toBe(true);
    expect(ability.can('read', 'User')).toBe(true);
    expect(ability.can('delete', 'AuditLog')).toBe(true);
    expect(ability.can('update', 'Credit')).toBe(true);
  });
});

// ─── Super Admin Abilities ────────────────────────────────────────────────────

describe('Super Admin Abilities', () => {
  it('should manage all resources (same as admin)', () => {
    const ability = buildAbility(superAdminUser);
    expect(ability.can('manage', 'all')).toBe(true);
    expect(ability.can('create', 'Invoice')).toBe(true);
    expect(ability.can('delete', 'User')).toBe(true);
  });
});

// ─── User Abilities ───────────────────────────────────────────────────────────

describe('User Abilities', () => {
  it('should CRUD own invoices', () => {
    expect(can(regularUser, 'create', 'Invoice')).toBe(true);
    expect(can(regularUser, 'read', 'Invoice')).toBe(true);
    expect(can(regularUser, 'update', 'Invoice')).toBe(true);
    expect(can(regularUser, 'delete', 'Invoice')).toBe(true);
  });

  it('should CRUD own invoice conversions', () => {
    expect(can(regularUser, 'create', 'InvoiceConversion')).toBe(true);
    expect(can(regularUser, 'read', 'InvoiceConversion')).toBe(true);
    expect(can(regularUser, 'update', 'InvoiceConversion')).toBe(true);
    expect(can(regularUser, 'delete', 'InvoiceConversion')).toBe(true);
  });

  it('should read own credits', () => {
    expect(can(regularUser, 'read', 'Credit')).toBe(true);
  });

  it('should read own audit logs', () => {
    expect(can(regularUser, 'read', 'AuditLog')).toBe(true);
  });

  it('should read and update own user profile', () => {
    expect(can(regularUser, 'read', 'User')).toBe(true);
    expect(can(regularUser, 'update', 'User')).toBe(true);
  });

  it('should NOT manage all', () => {
    const ability = buildAbility(regularUser);
    expect(ability.can('manage', 'all')).toBe(false);
  });

  it('should NOT delete users', () => {
    expect(cannot(regularUser, 'delete', 'User')).toBe(true);
  });

  it('should NOT manage payments', () => {
    expect(cannot(regularUser, 'create', 'Payment')).toBe(true);
    expect(cannot(regularUser, 'delete', 'Payment')).toBe(true);
  });
});

// ─── Accountant Abilities ─────────────────────────────────────────────────────

describe('Accountant Abilities', () => {
  it('should read invoices for assigned org', () => {
    expect(can(accountantUser, 'read', 'Invoice')).toBe(true);
  });

  it('should convert invoices for assigned org', () => {
    expect(can(accountantUser, 'convert', 'Invoice')).toBe(true);
    expect(can(accountantUser, 'convert', 'InvoiceConversion')).toBe(true);
  });

  it('should read credits for assigned org', () => {
    expect(can(accountantUser, 'read', 'Credit')).toBe(true);
  });

  it('should NOT create or delete invoices', () => {
    expect(cannot(accountantUser, 'create', 'Invoice')).toBe(true);
    expect(cannot(accountantUser, 'delete', 'Invoice')).toBe(true);
  });

  it('should NOT manage users', () => {
    expect(cannot(accountantUser, 'read', 'User')).toBe(true);
    expect(cannot(accountantUser, 'update', 'User')).toBe(true);
    expect(cannot(accountantUser, 'delete', 'User')).toBe(true);
  });

  it('should NOT read audit logs', () => {
    expect(cannot(accountantUser, 'read', 'AuditLog')).toBe(true);
  });
});

// ─── Unknown Role ─────────────────────────────────────────────────────────────

describe('Unknown Role', () => {
  it('should have no permissions', () => {
    const ability = buildAbility(unknownRoleUser);
    expect(ability.can('read', 'Invoice')).toBe(false);
    expect(ability.can('manage', 'all')).toBe(false);
  });
});

// ─── Helper Functions ─────────────────────────────────────────────────────────

describe('Helper Functions', () => {
  it('can() should return true for permitted actions', () => {
    expect(can(adminUser, 'manage', 'all')).toBe(true);
  });

  it('cannot() should return true for denied actions', () => {
    expect(cannot(regularUser, 'manage', 'all')).toBe(true);
  });

  it('assertCan() should not throw for permitted actions', () => {
    expect(() => assertCan(adminUser, 'manage', 'all')).not.toThrow();
  });

  it('assertCan() should throw ForbiddenError for denied actions', () => {
    expect(() => assertCan(regularUser, 'manage', 'all')).toThrow(ForbiddenError);
  });

  it('assertCan() error message should include action and subject', () => {
    expect(() => assertCan(regularUser, 'delete', 'Payment')).toThrow(
      'Permission denied: cannot delete Payment'
    );
  });
});
