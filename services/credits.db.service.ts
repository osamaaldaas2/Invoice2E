import { createServerClient, createUserScopedClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import { AppError, NotFoundError, ValidationError } from '@/lib/errors';
import type { UserCredits } from '@/types';
import { snakeToCamelKeys } from '@/lib/database-helpers';

export class CreditsDatabaseService {
    // FIX: Audit #001, #006, #031 — use user-scoped client for direct queries (RLS-protected)
    // RPCs are SECURITY DEFINER and bypass RLS by design, so admin client is fine for those.
    private getSupabase() {
        return createServerClient();
    }

    private async getUserScopedSupabase(userId: string) {
        return createUserScopedClient(userId);
    }

    async createCredits(userId: string, initialCredits: number = 0): Promise<UserCredits> {
        // createCredits is called during signup (no user session yet) — use admin client
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
        // FIX: Audit #001 — use user-scoped client for direct queries
        const supabase = await this.getUserScopedSupabase(userId);

        const { data, error } = await supabase
            .from('user_credits')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error) {
            logger.error('Failed to get credits', { userId, error: error.message });
            throw new NotFoundError('Credits not found');
        }

        const credits = snakeToCamelKeys(data) as UserCredits;

        // GAP-1: Check credit expiry
        const expiryDate = (data as Record<string, unknown>).credits_expiry_date as string | null;
        if (expiryDate && new Date(expiryDate) < new Date()) {
            logger.info('User credits expired', { userId, expiryDate });
            return { ...credits, availableCredits: 0 };
        }

        return credits;
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

        // credit_transactions insert is handled by the add_credits RPC (migration 027)

        // Return updated credits
        return this.getUserCredits(userId);
    }

    /**
     * Atomically verify a payment and add credits with idempotency.
     * Uses verify_and_add_credits RPC — the idempotency marker (webhook_events insert)
     * happens inside the same transaction as the credit addition.
     */
    async verifyAndAddCredits(
        userId: string,
        amount: number,
        eventId: string,
        provider: string,
        eventType: string,
        referenceId?: string
    ): Promise<{ success: boolean; alreadyProcessed: boolean; newBalance?: number }> {
        if (amount <= 0) {
            throw new ValidationError('Amount must be positive');
        }

        const supabase = this.getSupabase();

        const { data, error } = await supabase.rpc('verify_and_add_credits', {
            p_user_id: userId,
            p_amount: amount,
            p_event_id: eventId,
            p_provider: provider,
            p_event_type: eventType,
            p_reference_id: referenceId || null,
        });

        if (error) {
            logger.error('verify_and_add_credits RPC failed', {
                userId, amount, eventId, provider, error: error.message,
            });
            throw new AppError('DB_ERROR', 'Failed to verify and add credits', 500);
        }

        const result = data as { success: boolean; already_processed: boolean; new_balance?: number; error?: string };

        if (!result.success) {
            logger.error('verify_and_add_credits returned failure', {
                userId, eventId, error: result.error,
            });
            throw new AppError('DB_ERROR', result.error || 'Failed to add credits', 500);
        }

        // credit_transactions insert is handled by the verify_and_add_credits RPC (migration 027)

        return {
            success: true,
            alreadyProcessed: result.already_processed,
            newBalance: result.new_balance,
        };
    }

    /**
     * FIX: Audit #014, #015 — idempotent credit refund.
     * Uses refund_credits_idempotent RPC to prevent double-refunds.
     */
    async refundCreditsIdempotent(
        userId: string,
        amount: number,
        reason: string,
        idempotencyKey: string
    ): Promise<{ status: string; amount?: number }> {
        if (amount <= 0) {
            throw new ValidationError('Refund amount must be positive');
        }

        const supabase = this.getSupabase();

        const { data, error } = await supabase.rpc('refund_credits_idempotent', {
            p_user_id: userId,
            p_amount: amount,
            p_reason: reason,
            p_idempotency_key: idempotencyKey,
        });

        if (error) {
            logger.error('refund_credits_idempotent failed', {
                userId, amount, reason, idempotencyKey, error: error.message,
            });
            throw new AppError('DB_ERROR', 'Failed to refund credits', 500);
        }

        const result = data as { status: string; amount?: number };
        if (result.status === 'already_refunded') {
            logger.info('Refund already processed (idempotent)', { userId, idempotencyKey });
        } else {
            logger.info('Credits refunded', { userId, amount, reason, idempotencyKey });
        }

        return result;
    }
}

export const creditsDbService = new CreditsDatabaseService();
