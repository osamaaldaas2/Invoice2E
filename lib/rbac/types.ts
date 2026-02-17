/**
 * RBAC Type Definitions
 * Defines roles, actions, subjects, and permission types for CASL.js integration.
 */

/** All roles supported by the RBAC system */
export type Role = 'user' | 'admin' | 'super_admin' | 'accountant';

/** CRUD + manage actions for CASL ability definitions */
export type Action = 'create' | 'read' | 'update' | 'delete' | 'manage' | 'convert';

/** Resource subjects that can be governed by permissions */
export type Subject =
  | 'Invoice'
  | 'InvoiceConversion'
  | 'Credit'
  | 'AuditLog'
  | 'User'
  | 'Payment'
  | 'all';

/** A single permission entry mapping action + subject with optional conditions */
export interface Permission {
  /** The action being permitted or denied */
  action: Action | Action[];
  /** The subject/resource the action applies to */
  subject: Subject;
  /** Optional CASL conditions object (e.g. { userId: '{{id}}' }) */
  conditions?: Record<string, unknown>;
  /** If true, this is a denial rule (cannot) */
  inverted?: boolean;
}

/** Role definition with metadata */
export interface RoleDefinition {
  /** Machine-readable role key */
  key: Role;
  /** Human-readable name */
  name: string;
  /** Description of what this role can do */
  description: string;
  /** Permissions granted to this role */
  permissions: Permission[];
}

/** User context required for building CASL abilities */
export interface RbacUser {
  id: string;
  role: Role;
  /** Organization ID for accountants scoped to specific orgs */
  organizationId?: string;
}
