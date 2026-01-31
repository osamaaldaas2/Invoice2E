/**
 * User service placeholder
 * Will be implemented in Phase 1.3
 */

import { logger } from '@/lib/logger';
import type { UserProfile, UpdateProfileRequest } from '@/types/user.types';

export const userService = {
    getProfile: async (_userId: string): Promise<UserProfile | null> => {
        logger.info('Get profile attempt - service not implemented yet');
        throw new Error('User service not implemented. Please wait for Phase 1.3.');
    },

    updateProfile: async (
        _userId: string,
        _data: UpdateProfileRequest
    ): Promise<UserProfile> => {
        logger.info('Update profile attempt - service not implemented yet');
        throw new Error('User service not implemented. Please wait for Phase 1.3.');
    },
};
