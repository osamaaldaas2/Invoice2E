import { createAdminClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import { AppError } from '@/lib/errors';
import type { PaymentTransaction } from '@/types';
import { camelToSnakeKeys, snakeToCamelKeys } from '@/lib/database-helpers';

export type CreatePaymentData = {
  userId: string;
  stripePaymentId?: string;
  amount: number;
  currency?: string;
  creditsPurchased: number;
  paymentMethod: string;
  paymentStatus: string;
};

export class PaymentDatabaseService {
  private getSupabase() {
    return createAdminClient();
  }

  async createTransaction(data: CreatePaymentData): Promise<PaymentTransaction> {
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

    return (data ?? []).map(
      (item: Record<string, unknown>) => snakeToCamelKeys(item) as PaymentTransaction
    );
  }

  async updatePaymentStatus(transactionId: string, status: string): Promise<PaymentTransaction> {
    const supabase = this.getSupabase();

    const { data, error } = await supabase
      .from('payment_transactions')
      .update({ payment_status: status })
      .eq('id', transactionId)
      .select()
      .single();

    if (error) {
      logger.error('Failed to update payment', { transactionId, error: error.message });
      throw new AppError('DB_ERROR', 'Failed to update payment', 500);
    }

    return snakeToCamelKeys(data) as PaymentTransaction;
  }
  /**
   * Expire pending payment transactions older than specified minutes.
   * FIX-011: Prevents abandoned checkout sessions from remaining permanent.
   */
  async expirePendingTransactions(olderThanMinutes: number = 60): Promise<number> {
    const supabase = this.getSupabase();
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('payment_transactions')
      .update({ payment_status: 'expired' })
      .eq('payment_status', 'pending')
      .lt('created_at', cutoff)
      .select('id');

    if (error) {
      logger.error('Failed to expire pending transactions', { error: error.message });
      throw new AppError('DB_ERROR', 'Failed to expire transactions', 500);
    }

    const count = data?.length || 0;
    if (count > 0) {
      logger.info('Expired pending transactions', { count, olderThanMinutes });
    }
    return count;
  }
}

export const paymentDbService = new PaymentDatabaseService();
