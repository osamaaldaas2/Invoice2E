/**
 * Billing domain — public API.
 *
 * @module domains/billing
 */

export type {
  PurchaseCreditsRequest,
  PurchaseCreditsResult,
  DeductCreditsRequest,
  CreditBalance,
  BillingErrorCodeType,
  UserCredits,
  PaymentTransaction,
  PaymentStatusType,
} from './types';
export { BillingErrorCode } from './types';

export type {
  IBillingRepository,
  CreatePaymentInput,
} from './billing.repository';

export type { IBillingService, BillingServiceDeps } from './billing.service';
export { createBillingService } from './billing.service';
