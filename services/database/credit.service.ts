import { createServerClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import { AppError, NotFoundError } from '@/lib/errors';
import type { UserCredits } from '@/types';
import { snakeToCamelKeys } from '@/lib/database-helpers';

export class CreditService {
    private getSupabase() {
        return createServerClient();
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

    async createUserCredits(userId: string, initialCredits: number = 0): Promise<UserCredits> {
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

    async deductCredits(userId: string, amount: number = 1): Promise<boolean> {
        const supabase = this.getSupabase();

        const { data, error } = await supabase.rpc('deduct_credits', {
            p_user_id: userId,
            p_amount: amount,
        });

        if (error) {
            logger.error('Failed to deduct credits', { userId, amount, error: error.message });
            throw new AppError('DB_ERROR', 'Failed to deduct credits', 500);
        }

        return data as boolean;
    }

    async addCredits(userId: string, amount: number, source: string = 'manual'): Promise<UserCredits> {
        const supabase = this.getSupabase();

        // FIX: Use atomic RPC call instead of invalid nested RPC in update
        const { error: rpcError } = await supabase.rpc('add_credits', {
            p_user_id: userId,
            p_amount: amount,
            p_source: source,
            p_reference_id: null,
        });

        if (rpcError) {
            logger.error('Failed to add credits via RPC', { userId, amount, error: rpcError.message });
            throw new AppError('DB_ERROR', 'Failed to add credits', 500);
        }

        // Fetch the updated credits record
        const { data, error } = await supabase
            .from('user_credits')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error) {
            logger.error('Failed to fetch credits after add', { userId, error: error.message });
            throw new AppError('DB_ERROR', 'Failed to fetch credits', 500);
        }

        return snakeToCamelKeys(data) as UserCredits;
    }
}

export const creditService = new CreditService();
