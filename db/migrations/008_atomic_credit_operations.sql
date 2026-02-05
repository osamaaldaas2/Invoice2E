-- Migration 008: Atomic Credit Operations
-- SECURITY FIX (BUG-006/007): Prevent race conditions in credit operations
-- Created: 2026-02-04

-- Function to atomically add credits to a user
-- Returns the new balance, or creates a record if user doesn't have one
CREATE OR REPLACE FUNCTION add_credits(
    p_user_id UUID,
    p_amount INTEGER,
    p_source VARCHAR(50) DEFAULT 'payment',
    p_reference_id VARCHAR(255) DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    new_balance INTEGER;
BEGIN
    -- Validate input
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Amount must be positive, got: %', p_amount;
    END IF;

    -- Atomic upsert with returning
    INSERT INTO user_credits (user_id, available_credits, used_credits)
    VALUES (p_user_id, p_amount, 0)
    ON CONFLICT (user_id)
    DO UPDATE SET
        available_credits = user_credits.available_credits + EXCLUDED.available_credits,
        updated_at = NOW()
    RETURNING available_credits INTO new_balance;

    -- Log the credit addition for audit
    INSERT INTO audit_logs (user_id, action, resource_type, resource_id, changes)
    VALUES (
        p_user_id,
        'credits_added',
        'user_credits',
        p_reference_id,
        jsonb_build_object(
            'amount', p_amount,
            'source', p_source,
            'new_balance', new_balance
        )
    );

    RETURN new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to atomically deduct credits (with balance check)
-- Returns true if successful, false if insufficient credits
CREATE OR REPLACE FUNCTION safe_deduct_credits(
    p_user_id UUID,
    p_amount INTEGER DEFAULT 1,
    p_reason VARCHAR(255) DEFAULT 'conversion'
) RETURNS BOOLEAN AS $$
DECLARE
    current_balance INTEGER;
    new_balance INTEGER;
BEGIN
    -- Validate input
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Amount must be positive, got: %', p_amount;
    END IF;

    -- Lock the row and get current balance
    SELECT available_credits INTO current_balance
    FROM user_credits
    WHERE user_id = p_user_id
    FOR UPDATE;

    -- Check if user has credits record
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Check if sufficient balance
    IF current_balance < p_amount THEN
        RETURN FALSE;
    END IF;

    -- Atomic deduction
    UPDATE user_credits
    SET
        available_credits = available_credits - p_amount,
        used_credits = used_credits + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id
    RETURNING available_credits INTO new_balance;

    -- Log the deduction for audit
    INSERT INTO audit_logs (user_id, action, resource_type, changes)
    VALUES (
        p_user_id,
        'credits_deducted',
        'user_credits',
        jsonb_build_object(
            'amount', p_amount,
            'reason', p_reason,
            'new_balance', new_balance
        )
    );

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION add_credits(UUID, INTEGER, VARCHAR, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION safe_deduct_credits(UUID, INTEGER, VARCHAR) TO service_role;

-- Add comments
COMMENT ON FUNCTION add_credits IS 'Atomically adds credits to a user account. Race-condition safe.';
COMMENT ON FUNCTION safe_deduct_credits IS 'Atomically deducts credits with balance check. Returns false if insufficient.';
