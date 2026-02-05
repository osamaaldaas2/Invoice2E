import { createServerClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import { AppError, NotFoundError, ValidationError } from '@/lib/errors';
import type { UserCredits } from '@/types';
import { snakeToCamelKeys } from '@/lib/database-helpers';

export class CreditsDatabaseService {
    private getSupabase() {
        return createServerClient();
    }

    async createCredits(userId: string, initialCredits: number = 0): Promise<UserCredits> {
        const supabase = this.getSupabase();

        const { data, error } = await supabase
            .from('user_credits')
            .insert([{ user_id: userId, available_credits: initialCredits }])
            .select()
            .single();

        if (error) {
            logger.error('Failed to create credits', { userId, error: error.message });
            throw new AppError('DB_ERROR', 'Failed to create credits', 500);
        }

        return snakeToCamelKeys(data) as UserCredits;
    }

    async getUserCredits(userId: string): Promise<UserCredits> {
        const supabase = this.getSupabase();

        const { data, error } = await supabase
            .from('user_credits')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error) {
            logger.error('Failed to get credits', { userId, error: error.message });
            throw new NotFoundError('Credits not found');
        }

        return snakeToCamelKeys(data) as UserCredits;
    }

    /**
     * Deduct credits from user account atomically
     * Uses safe_deduct_credits RPC for atomic operation with balance check
     */
    async deductCredits(userId: string, amount: number = 1, reason: string = 'conversion'): Promise<boolean> {
        // Validate input
        if (amount <= 0) {
            throw new ValidationError('Amount must be positive');
        }

        const supabase = this.getSupabase();

        // Use atomic RPC function with built-in balance check
        const { data, error } = await supabase.rpc('safe_deduct_credits', {
            p_user_id: userId,
            p_amount: amount,
            p_reason: reason,
        });

        if (error) {
            logger.error('Failed to deduct credits', { userId, amount, reason, error: error.message });
            throw new AppError('DB_ERROR', 'Failed to deduct credits', 500);
        }

        const success = data as boolean;

        if (!success) {
            logger.warn('Insufficient credits for deduction', { userId, amount, reason });
        } else {
            logger.info('Credits deducted successfully', { userId, amount, reason });
        }

        return success;
    }

    /**
     * SECURITY FIX (BUG-006): Use atomic RPC function to prevent race conditions
     * The previous read-modify-write pattern was vulnerable to lost updates
     */
    async addCredits(
        userId: string,
        amount: number,
        source: string = 'payment',
        referenceId?: string
    ): Promise<UserCredits> {
        // Validate input
        if (amount <= 0) {
            throw new ValidationError('Amount must be positive');
        }

        const supabase = this.getSupabase();

        // Use atomic RPC function to prevent race conditions
        const { data: newBalance, error } = await supabase.rpc('add_credits', {
            p_user_id: userId,
            p_amount: amount,
            p_source: source,
            p_reference_id: referenceId || null,
        });

        if (error) {
            logger.error('Failed to add credits atomically', {
                userId,
                amount,
                source,
                error: error.message,
            });
            throw new AppError('DB_ERROR', 'Failed to add credits', 500);
        }

        logger.info('Credits added atomically', {
            userId,
            amount,
            source,
            newBalance,
        });

        // Return updated credits
        return this.getUserCredits(userId);
    }
}

export const creditsDbService = new CreditsDatabaseService();
