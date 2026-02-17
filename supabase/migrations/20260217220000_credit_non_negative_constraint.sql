-- FIX: Audit #043 — database-level non-negative credit constraint
-- Last line of defense against credit race conditions

-- Step 1: Verify no existing violations
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM user_credits WHERE available_credits < 0) THEN
    RAISE WARNING 'Negative credit balances exist — constraint NOT added. Fix data first.';
  ELSE
    -- Step 2: Add CHECK constraint (idempotent)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.check_constraints
      WHERE constraint_name = 'credits_non_negative'
    ) THEN
      ALTER TABLE user_credits ADD CONSTRAINT credits_non_negative CHECK (available_credits >= 0);
      RAISE NOTICE 'credits_non_negative constraint added successfully';
    END IF;
  END IF;
END $$;
