/**
 * Billing repository interface.
 *
 * @module domains/billing
 */

import type { UserCredits, PaymentTransaction } from './types';

/** Data for creating a payment transaction. */
export interface CreatePaymentInput {
  readonly userId: string;
  readonly stripePaymentId?: string;
  readonly amount: number;
  readonly currency: string;
  readonly creditsPurchased: number;
  readonly paymentMethod: string;
  readonly paymentStatus: string;
}

/** Repository interface for billing persistence. */
export interface IBillingRepository {
  /** Get credit balance for a user. */
  getCredits(userId: string): Promise<UserCredits | null>;

  /** Add credits to a user's balance. */
  addCredits(userId: string, amount: number): Promise<UserCredits>;

  /** Deduct credits from a user's balance. Returns false if insufficient. */
  deductCredits(userId: string, amount: number): Promise<boolean>;

  /** Check if user has sufficient credits. */
  hasCredits(userId: string, amount: number): Promise<boolean>;

  /** Create a payment transaction record. */
  createPayment(data: CreatePaymentInput): Promise<PaymentTransaction>;

  /** Find payment transactions for a user. */
  findPaymentsByUserId(
    userId: string,
    limit?: number,
    offset?: number,
  ): Promise<PaymentTransaction[]>;
}
