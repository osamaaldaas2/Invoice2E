/**
 * Authentication service placeholder
 * Will be implemented in Phase 1.3
 */

import { logger } from '@/lib/logger';
import type { LoginCredentials, SignupCredentials, AuthResponse } from '@/types/auth.types';

export const authService = {
    login: async (_credentials: LoginCredentials): Promise<AuthResponse> => {
        logger.info('Login attempt - service not implemented yet');
        throw new Error('Auth service not implemented. Please wait for Phase 1.3.');
    },

    signup: async (_credentials: SignupCredentials): Promise<AuthResponse> => {
        logger.info('Signup attempt - service not implemented yet');
        throw new Error('Auth service not implemented. Please wait for Phase 1.3.');
    },

    logout: async (): Promise<void> => {
        logger.info('Logout attempt - service not implemented yet');
        throw new Error('Auth service not implemented. Please wait for Phase 1.3.');
    },

    verifyEmail: async (_token: string): Promise<boolean> => {
        logger.info('Email verification attempt - service not implemented yet');
        throw new Error('Auth service not implemented. Please wait for Phase 1.3.');
    },
};
