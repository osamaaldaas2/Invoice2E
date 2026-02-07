import { createServerClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import { AppError } from '@/lib/errors';
import type { PaymentTransaction } from '@/types';
import { camelToSnakeKeys, snakeToCamelKeys } from '@/lib/database-helpers';
import { CreatePaymentData } from './types';

export class PaymentService {
    private getSupabase() {
        return createServerClient();
    }

    async createPayment(data: CreatePaymentData): Promise<PaymentTransaction> {
        const supabase = this.getSupabase();
        const snakeData = camelToSnakeKeys(data);

        const { data: payment, error } = await supabase
            .from('payment_transactions')
            .insert([snakeData])
            .select()
            .single();

        if (error) {
            logger.error('Failed to create payment', { error: error.message });
            throw new AppError('DB_ERROR', 'Failed to save payment', 500);
        }

        return snakeToCamelKeys(payment) as PaymentTransaction;
    }

    async getUserPayments(userId: string, limit: number = 10): Promise<PaymentTransaction[]> {
        const supabase = this.getSupabase();

        const { data, error } = await supabase
            .from('payment_transactions')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            logger.error('Failed to get payments', { userId, error: error.message });
            throw new AppError('DB_ERROR', 'Failed to fetch payments', 500);
        }

        return (data ?? []).map((item: Record<string, unknown>) => snakeToCamelKeys(item) as PaymentTransaction);
    }
}

export const paymentService = new PaymentService();
