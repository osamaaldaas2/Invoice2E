/**
 * Identity domain — public API.
 *
 * @module domains/identity
 */

export type {
  CreateUserRequest,
  UpdateUserRequest,
  AuthSession,
  AuditLogInput,
  IdentityErrorCodeType,
  User,
  UserRole,
  AuditLog,
} from './types';
export { IdentityErrorCode } from './types';

export type { IIdentityService, IdentityServiceDeps } from './identity.service';
export { createIdentityService } from './identity.service';
