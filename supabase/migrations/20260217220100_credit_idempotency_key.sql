-- FIX: Audit #014, #015, #026 — enforce idempotency at DB level for credit transactions
-- Prevents double-deduction and double-refund even under concurrent retries

-- Add idempotency_key column if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'credit_transactions' AND column_name = 'idempotency_key'
  ) THEN
    ALTER TABLE credit_transactions ADD COLUMN idempotency_key TEXT;
  END IF;
END $$;

-- Partial unique index — only enforces uniqueness on non-null keys
-- Nulls don't conflict, so existing rows without keys are unaffected
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_transactions_idempotency_key
  ON credit_transactions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
