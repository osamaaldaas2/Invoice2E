/**
 * Identity domain service.
 *
 * Orchestrates authentication, user management, RBAC, and audit logging.
 *
 * @module domains/identity
 */

import type {
  User,
  UserRole,
  AuditLog,
  CreateUserRequest,
  UpdateUserRequest,
  AuthSession,
  AuditLogInput,
} from './types';

/** Dependencies injected into the identity service. */
export interface IdentityServiceDeps {
  // Future: readonly userRepository: IUserRepository;
  // Future: readonly auditRepository: IAuditRepository;
  // Future: readonly authAdapter: IAuthAdapter;
}

/** Identity domain service interface. */
export interface IIdentityService {
  /** Get current authenticated session. */
  getSession(): Promise<AuthSession | null>;

  /** Get user by ID. */
  getUserById(id: string): Promise<User | null>;

  /** Get user by email. */
  getUserByEmail(email: string): Promise<User | null>;

  /** Create a new user. */
  createUser(request: CreateUserRequest): Promise<User>;

  /** Update user profile. */
  updateUser(id: string, request: UpdateUserRequest): Promise<User>;

  /** Update user role (admin only). */
  updateRole(userId: string, role: UserRole, adminId: string): Promise<User>;

  /** Ban a user (admin only). */
  banUser(userId: string, reason: string, adminId: string): Promise<void>;

  /** Create an audit log entry. */
  audit(input: AuditLogInput): Promise<AuditLog>;
}

/** Creates the identity service. */
export function createIdentityService(_deps: IdentityServiceDeps): IIdentityService {
  return {
    async getSession(): Promise<AuthSession | null> {
      // TODO: Migrate from services/auth.service.ts
      throw new Error('Not yet implemented — delegates to existing services during migration');
    },

    async getUserById(_id: string): Promise<User | null> {
      throw new Error('Not yet implemented — delegates to existing services during migration');
    },

    async getUserByEmail(_email: string): Promise<User | null> {
      throw new Error('Not yet implemented — delegates to existing services during migration');
    },

    async createUser(_request: CreateUserRequest): Promise<User> {
      throw new Error('Not yet implemented — delegates to existing services during migration');
    },

    async updateUser(_id: string, _request: UpdateUserRequest): Promise<User> {
      throw new Error('Not yet implemented — delegates to existing services during migration');
    },

    async updateRole(_userId: string, _role: UserRole, _adminId: string): Promise<User> {
      throw new Error('Not yet implemented — delegates to existing services during migration');
    },

    async banUser(_userId: string, _reason: string, _adminId: string): Promise<void> {
      throw new Error('Not yet implemented — delegates to existing services during migration');
    },

    async audit(_input: AuditLogInput): Promise<AuditLog> {
      throw new Error('Not yet implemented — delegates to existing services during migration');
    },
  };
}
