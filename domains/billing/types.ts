/**
 * Billing domain types.
 *
 * @module domains/billing
 */

import type { UserCredits, PaymentTransaction, PaymentStatusType } from '@/types';

export type { UserCredits, PaymentTransaction, PaymentStatusType };

/** Request to purchase credits. */
export interface PurchaseCreditsRequest {
  readonly userId: string;
  readonly creditAmount: number;
  readonly paymentMethod: 'stripe' | 'paypal';
  /** Idempotency key to prevent duplicate charges. */
  readonly idempotencyKey: string;
}

/** Result of a credit purchase. */
export interface PurchaseCreditsResult {
  readonly transaction: PaymentTransaction;
  readonly newBalance: number;
}

/** Request to deduct credits for a service usage. */
export interface DeductCreditsRequest {
  readonly userId: string;
  readonly amount: number;
  readonly reason: string;
  /** Associated resource (extraction or conversion ID). */
  readonly resourceId: string;
  readonly resourceType: 'extraction' | 'conversion';
}

/** Credit balance snapshot. */
export interface CreditBalance {
  readonly available: number;
  readonly used: number;
  readonly expiryDate: Date | null;
}

/** Billing domain error codes. */
export const BillingErrorCode = {
  INSUFFICIENT_CREDITS: 'BILLING_INSUFFICIENT_CREDITS',
  PAYMENT_FAILED: 'BILLING_PAYMENT_FAILED',
  CREDITS_EXPIRED: 'BILLING_CREDITS_EXPIRED',
  DUPLICATE_TRANSACTION: 'BILLING_DUPLICATE_TRANSACTION',
  USER_NOT_FOUND: 'BILLING_USER_NOT_FOUND',
} as const;

export type BillingErrorCodeType = (typeof BillingErrorCode)[keyof typeof BillingErrorCode];
