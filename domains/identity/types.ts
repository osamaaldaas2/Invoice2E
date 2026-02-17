/**
 * Identity domain types.
 *
 * @module domains/identity
 */

import type { User, UserRole, AuditLog } from '@/types';

export type { User, UserRole, AuditLog };

/** Request to create a new user. */
export interface CreateUserRequest {
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly role?: UserRole;
}

/** Request to update user profile. */
export interface UpdateUserRequest {
  readonly firstName?: string;
  readonly lastName?: string;
  readonly addressLine1?: string;
  readonly addressLine2?: string;
  readonly city?: string;
  readonly postalCode?: string;
  readonly country?: string;
  readonly phone?: string;
  readonly taxId?: string;
  readonly language?: string;
}

/** Authenticated session info. */
export interface AuthSession {
  readonly userId: string;
  readonly email: string;
  readonly role: UserRole;
  readonly expiresAt: Date;
}

/** Audit log entry input. */
export interface AuditLogInput {
  readonly userId?: string;
  readonly action: string;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly changes?: Record<string, unknown>;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

/** Identity domain error codes. */
export const IdentityErrorCode = {
  USER_NOT_FOUND: 'IDENTITY_USER_NOT_FOUND',
  EMAIL_TAKEN: 'IDENTITY_EMAIL_TAKEN',
  UNAUTHORIZED: 'IDENTITY_UNAUTHORIZED',
  FORBIDDEN: 'IDENTITY_FORBIDDEN',
  BANNED: 'IDENTITY_BANNED',
  SESSION_EXPIRED: 'IDENTITY_SESSION_EXPIRED',
} as const;

export type IdentityErrorCodeType = (typeof IdentityErrorCode)[keyof typeof IdentityErrorCode];
