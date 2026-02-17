# Billing Domain

## Purpose

The **billing** bounded context manages credits, payments, and usage tracking.

## Responsibilities

- Credit balance management (allocation, deduction, expiry)
- Payment processing via Stripe/PayPal adapters
- Usage tracking per extraction/conversion
- Payment transaction history

## Key Files

| File | Purpose |
|---|---|
| `types.ts` | Billing-specific types and interfaces |
| `billing.service.ts` | Orchestrates billing operations |
| `billing.repository.ts` | Data access interface for credits and payments |
| `index.ts` | Barrel exports (public API) |

## Dependencies

- **Adapters**: Stripe, PayPal payment adapters
- **Identity domain**: User lookup for billing context

## Migration Notes

Currently delegates to:
- `services/credits.db.service.ts` — Credit DB operations
- `services/payment.db.service.ts` — Payment DB operations
- `adapters/stripe.adapter.ts` — Stripe integration
- `adapters/paypal.adapter.ts` — PayPal integration
