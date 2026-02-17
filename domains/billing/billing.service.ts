/**
 * Billing domain service.
 *
 * Orchestrates credit management and payment processing.
 *
 * @module domains/billing
 */

import type { IBillingRepository } from './billing.repository';
import type {
  PurchaseCreditsRequest,
  PurchaseCreditsResult,
  DeductCreditsRequest,
  CreditBalance,
  PaymentTransaction,
} from './types';

/** Dependencies injected into the billing service. */
export interface BillingServiceDeps {
  readonly billingRepository: IBillingRepository;
  // Future: readonly stripeAdapter: IStripeAdapter;
  // Future: readonly paypalAdapter: IPayPalAdapter;
}

/** Billing domain service interface. */
export interface IBillingService {
  /** Get current credit balance for a user. */
  getBalance(userId: string): Promise<CreditBalance>;

  /** Purchase credits via payment provider. */
  purchaseCredits(request: PurchaseCreditsRequest): Promise<PurchaseCreditsResult>;

  /** Deduct credits for a service usage. */
  deductCredits(request: DeductCreditsRequest): Promise<boolean>;

  /** Check if user has sufficient credits. */
  hasCredits(userId: string, amount: number): Promise<boolean>;

  /** List payment history for a user. */
  listPayments(userId: string, limit?: number, offset?: number): Promise<PaymentTransaction[]>;
}

/** Creates the billing service. */
export function createBillingService(deps: BillingServiceDeps): IBillingService {
  const { billingRepository } = deps;

  return {
    async getBalance(userId: string): Promise<CreditBalance> {
      const credits = await billingRepository.getCredits(userId);
      return {
        available: credits?.availableCredits ?? 0,
        used: credits?.usedCredits ?? 0,
        expiryDate: credits?.creditsExpiryDate ?? null,
      };
    },

    async purchaseCredits(_request: PurchaseCreditsRequest): Promise<PurchaseCreditsResult> {
      // TODO: Migrate from payment flow
      throw new Error('Not yet implemented — delegates to existing services during migration');
    },

    async deductCredits(request: DeductCreditsRequest): Promise<boolean> {
      return billingRepository.deductCredits(request.userId, request.amount);
    },

    async hasCredits(userId: string, amount: number): Promise<boolean> {
      return billingRepository.hasCredits(userId, amount);
    },

    async listPayments(
      userId: string,
      limit = 20,
      offset = 0,
    ): Promise<PaymentTransaction[]> {
      return billingRepository.findPaymentsByUserId(userId, limit, offset);
    },
  };
}
