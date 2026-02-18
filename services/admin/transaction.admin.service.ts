/**
 * Admin Transaction Service
 * Handles transaction viewing and refund operations for admins
 */

import { createAdminClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import { AppError, NotFoundError } from '@/lib/errors';
import { AdminTransaction, AdminTransactionsFilter, RefundTransactionInput } from '@/types/admin';
import { adminAuditService } from './audit.admin.service';
import { stripeService } from '../stripe.service';
import { paypalService } from '../paypal.service';
import { creditsDbService } from '../credits.db.service';

type TransactionRow = {
  id: string;
  user_id: string;
  stripe_payment_id?: string | null;
  paypal_order_id?: string | null;
  amount: string;
  currency?: string | null;
  credits_purchased?: number | null;
  payment_method?: string | null;
  payment_status?: string | null;
  created_at: string;
  users?:
    | { email?: string; first_name?: string; last_name?: string }
    | Array<{ email?: string; first_name?: string; last_name?: string }>;
};

class AdminTransactionService {
  private getSupabase() {
    return createAdminClient();
  }

  /**
   * Get paginated list of all transactions
   */
  async getAllTransactions(
    page: number = 1,
    limit: number = 20,
    filters?: AdminTransactionsFilter
  ): Promise<{ transactions: AdminTransaction[]; total: number }> {
    const supabase = this.getSupabase();

    // Build query
    let query = supabase
      .from('payment_transactions')
      .select(
        `
                id, user_id, stripe_payment_id, paypal_order_id,
                amount, currency, credits_purchased, payment_method,
                payment_status, created_at,
                users(email, first_name, last_name)
            `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters?.userId) {
      query = query.eq('user_id', filters.userId);
    }
    if (filters?.status) {
      query = query.eq('payment_status', filters.status);
    }
    if (filters?.paymentMethod) {
      query = query.eq('payment_method', filters.paymentMethod);
    }
    if (filters?.startDate) {
      query = query.gte('created_at', filters.startDate);
    }
    if (filters?.endDate) {
      query = query.lte('created_at', filters.endDate);
    }

    // Pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      logger.error('Failed to fetch transactions', { error: error.message });
      throw new AppError('DB_ERROR', 'Failed to fetch transactions', 500);
    }

    // Transform data
    const transactions: AdminTransaction[] = (data || []).map((row: TransactionRow) => {
      // Handle Supabase join - users can be object or array depending on query
      const user = Array.isArray(row.users) ? row.users[0] : row.users;
      return {
        id: row.id,
        userId: row.user_id,
        userEmail: user?.email || 'Unknown',
        userName: user ? `${user.first_name} ${user.last_name}` : 'Unknown',
        stripePaymentId: row.stripe_payment_id ?? undefined,
        paypalOrderId: row.paypal_order_id ?? undefined,
        amount: parseFloat(row.amount) || 0,
        currency: row.currency || 'EUR',
        creditsPurchased: row.credits_purchased || 0,
        paymentMethod: row.payment_method || 'unknown',
        paymentStatus: row.payment_status || 'unknown',
        createdAt: new Date(row.created_at),
      };
    });

    return {
      transactions,
      total: count || 0,
    };
  }

  /**
   * Get transaction by ID
   */
  async getTransactionById(transactionId: string): Promise<AdminTransaction> {
    const supabase = this.getSupabase();

    const { data, error } = await supabase
      .from('payment_transactions')
      .select(
        `
                id, user_id, stripe_payment_id, paypal_order_id,
                amount, currency, credits_purchased, payment_method,
                payment_status, created_at,
                users(email, first_name, last_name)
            `
      )
      .eq('id', transactionId)
      .single();

    if (error || !data) {
      throw new NotFoundError('Transaction not found');
    }

    // Handle Supabase join - users can be object or array depending on query
    const user = Array.isArray(data.users) ? data.users[0] : data.users;

    return {
      id: data.id,
      userId: data.user_id,
      userEmail: user?.email || 'Unknown',
      userName: user ? `${user.first_name} ${user.last_name}` : 'Unknown',
      stripePaymentId: data.stripe_payment_id,
      paypalOrderId: data.paypal_order_id,
      amount: parseFloat(data.amount) || 0,
      currency: data.currency || 'EUR',
      creditsPurchased: data.credits_purchased || 0,
      paymentMethod: data.payment_method || 'unknown',
      paymentStatus: data.payment_status || 'unknown',
      createdAt: new Date(data.created_at),
    };
  }

  /**
   * Refund a transaction (super_admin only)
   * Processes refund through payment provider (Stripe/PayPal) and updates database
   */
  async refundTransaction(
    input: RefundTransactionInput,
    adminId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<AdminTransaction> {
    const supabase = this.getSupabase();

    // Get transaction for display data
    const transaction = await this.getTransactionById(input.transactionId);

    // Atomically claim this refund: transition completed → refunding
    // If another admin is already processing, this returns 0 rows
    const { data: claimed, error: claimError } = await supabase
      .from('payment_transactions')
      .update({
        payment_status: 'refunding',
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.transactionId)
      .eq('payment_status', 'completed')
      .select('id')
      .single();

    if (claimError || !claimed) {
      throw new AppError(
        'INVALID_STATUS',
        'Can only refund completed transactions (refund may already be in progress)',
        409
      );
    }

    // Process refund through payment provider
    let refundResult: {
      success: boolean;
      refundId?: string;
      error?: string;
      paymentIntentId?: string;
    } = { success: false };
    let providerRefundId: string | undefined;
    let correctedStripePaymentId: string | undefined;

    try {
      if (transaction.paymentMethod === 'stripe' && transaction.stripePaymentId) {
        // Refund through Stripe
        logger.info('Processing Stripe refund', {
          transactionId: input.transactionId,
          stripeId: transaction.stripePaymentId,
        });

        refundResult = await stripeService.refundPayment(transaction.stripePaymentId);
        providerRefundId = refundResult.refundId;

        // If we had a checkout session ID and retrieved the actual payment intent ID, save it
        if (refundResult.paymentIntentId) {
          correctedStripePaymentId = refundResult.paymentIntentId;
          logger.info('Retrieved actual payment intent ID from checkout session', {
            transactionId: input.transactionId,
            oldId: transaction.stripePaymentId,
            newId: correctedStripePaymentId,
          });
        }

        if (!refundResult.success) {
          logger.error('Stripe refund failed', {
            transactionId: input.transactionId,
            stripeId: transaction.stripePaymentId,
            error: refundResult.error,
          });
          throw new AppError(
            'REFUND_FAILED',
            `Stripe refund failed: ${refundResult.error || 'Unknown error'}. Please try again or process manually.`,
            500
          );
        }
      } else if (transaction.paymentMethod === 'paypal' && transaction.paypalOrderId) {
        // Refund through PayPal
        logger.info('Processing PayPal refund', {
          transactionId: input.transactionId,
          orderId: transaction.paypalOrderId,
        });

        // Convert amount to cents for PayPal refund
        const amountInCents = Math.round(transaction.amount * 100);
        refundResult = await paypalService.refundPayment(
          transaction.paypalOrderId,
          amountInCents,
          transaction.currency
        );
        providerRefundId = refundResult.refundId;

        if (!refundResult.success) {
          logger.error('PayPal refund failed', {
            transactionId: input.transactionId,
            orderId: transaction.paypalOrderId,
            error: refundResult.error,
          });
          throw new AppError(
            'REFUND_FAILED',
            `PayPal refund failed: ${refundResult.error || 'Unknown error'}. Please try again or process manually.`,
            500
          );
        }
      } else {
        // Unknown payment method or missing payment ID
        logger.warn('Unknown payment method or missing payment ID for refund', {
          transactionId: input.transactionId,
          paymentMethod: transaction.paymentMethod,
          stripePaymentId: transaction.stripePaymentId,
          paypalOrderId: transaction.paypalOrderId,
        });
        throw new AppError(
          'REFUND_FAILED',
          'Cannot process refund: Unknown payment method or missing payment provider ID',
          400
        );
      }
    } catch (providerError) {
      // Provider failed — revert status back to 'completed' so it can be retried
      await supabase
        .from('payment_transactions')
        .update({
          payment_status: 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.transactionId)
        .eq('payment_status', 'refunding');

      throw providerError;
    }

    logger.info('Payment provider refund successful', {
      transactionId: input.transactionId,
      paymentMethod: transaction.paymentMethod,
      refundId: providerRefundId,
    });

    // Finalize: transition refunding → refunded
    const finalUpdateData: Record<string, unknown> = {
      payment_status: 'refunded',
      updated_at: new Date().toISOString(),
    };

    // If we had to retrieve the actual payment intent ID from a checkout session,
    // update the database with the correct ID for future reference
    if (correctedStripePaymentId) {
      finalUpdateData.stripe_payment_id = correctedStripePaymentId;
      logger.info('Updating stripe_payment_id with correct payment intent ID', {
        transactionId: input.transactionId,
        oldId: transaction.stripePaymentId,
        newId: correctedStripePaymentId,
      });
    }

    const { error: updateError } = await supabase
      .from('payment_transactions')
      .update(finalUpdateData)
      .eq('id', input.transactionId)
      .eq('payment_status', 'refunding');

    if (updateError) {
      // Log error but don't throw - refund already processed
      logger.error('Failed to update transaction status after refund', {
        error: updateError.message,
        transactionId: input.transactionId,
        refundId: providerRefundId,
      });
    }

    // Deduct credits from user atomically (EXP-4 fix: was non-atomic read-modify-write)
    try {
      const deducted = await creditsDbService.deductCredits(
        transaction.userId,
        transaction.creditsPurchased,
        `refund:${input.transactionId}`
      );
      if (!deducted) {
        logger.warn('Credits deduction returned false during refund (insufficient balance)', {
          transactionId: input.transactionId,
          userId: transaction.userId,
          creditsToDeduct: transaction.creditsPurchased,
        });
      }
    } catch (creditError) {
      // Log but don't throw — the provider refund already succeeded
      logger.error('Failed to deduct credits during refund', {
        transactionId: input.transactionId,
        userId: transaction.userId,
        creditsToDeduct: transaction.creditsPurchased,
        error: creditError instanceof Error ? creditError.message : String(creditError),
      });
    }

    // Audit log
    await adminAuditService.logAdminAction({
      adminUserId: adminId,
      targetUserId: transaction.userId,
      action: 'transaction_refunded',
      resourceType: 'transaction',
      resourceId: input.transactionId,
      oldValues: {
        paymentStatus: 'completed',
        credits: transaction.creditsPurchased,
      },
      newValues: {
        paymentStatus: 'refunded',
        reason: input.reason,
        creditsDeducted: transaction.creditsPurchased,
        providerRefundId,
        paymentMethod: transaction.paymentMethod,
      },
      ipAddress,
      userAgent,
    });

    logger.info('Transaction refund completed', {
      transactionId: input.transactionId,
      userId: transaction.userId,
      adminId,
      amount: transaction.amount,
      credits: transaction.creditsPurchased,
      providerRefundId,
    });

    return {
      ...transaction,
      paymentStatus: 'refunded',
    };
  }

  /**
   * Get transactions for a specific user
   */
  async getTransactionsForUser(userId: string): Promise<AdminTransaction[]> {
    const { transactions } = await this.getAllTransactions(1, 100, { userId });
    return transactions;
  }
}

export const adminTransactionService = new AdminTransactionService();
