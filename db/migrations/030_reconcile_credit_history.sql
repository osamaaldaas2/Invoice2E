-- Migration 030: Reconcile credit history gap (HIGH)
-- Problem: User 778af93d has 3,343 available + 1,681 used = 5,024 total credits,
-- but credit_transactions only shows 24 credits added. The missing 5,000 credits
-- were granted before transaction logging was implemented.
-- Fix: Insert a retroactive credit_transaction record to close the gap.

INSERT INTO credit_transactions (user_id, amount, transaction_type, source, reference_id, balance_after)
VALUES (
    '778af93d-e173-43cc-bf5f-1b0a2be5d933',
    5000,
    'credit',
    'reconciliation',
    'retroactive-initial-grant-pre-logging',
    5024  -- balance at the time this grant would have been: 5000 + 24 existing credits
);
