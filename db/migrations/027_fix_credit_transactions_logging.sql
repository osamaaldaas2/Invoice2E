-- Migration 027: Fix credit_transactions logging
-- BUG-006: verify_and_add_credits() and add_credits() do not insert into credit_transactions table.
-- This causes the Credit History UI to show empty or missing entries after payment.
-- Fix: Add INSERT INTO credit_transactions to both RPC functions.

-- 1. Fix verify_and_add_credits to also log into credit_transactions
CREATE OR REPLACE FUNCTION verify_and_add_credits(
    p_user_id UUID,
    p_amount INTEGER,
    p_event_id VARCHAR(255),
    p_provider VARCHAR(50),
    p_event_type VARCHAR(100),
    p_reference_id VARCHAR(255) DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    new_balance INTEGER;
BEGIN
    -- 1. Insert idempotency marker FIRST (UNIQUE constraint prevents duplicates)
    INSERT INTO webhook_events (event_id, provider, event_type, user_id, credits_added)
    VALUES (p_event_id, p_provider, p_event_type, p_user_id, p_amount);

    -- 2. If we reach here, this is the first caller. Add credits atomically.
    INSERT INTO user_credits (user_id, available_credits, used_credits)
    VALUES (p_user_id, p_amount, 0)
    ON CONFLICT (user_id) DO UPDATE SET
        available_credits = user_credits.available_credits + EXCLUDED.available_credits,
        updated_at = NOW()
    RETURNING available_credits INTO new_balance;

    -- 3. Audit log
    INSERT INTO audit_logs (user_id, action, resource_type, resource_id, changes)
    VALUES (p_user_id, 'credits_added', 'user_credits', p_reference_id,
        jsonb_build_object('amount', p_amount, 'source', p_event_type, 'new_balance', new_balance));

    -- 4. Credit transaction log (for Credit History UI)
    INSERT INTO credit_transactions (user_id, amount, transaction_type, source, reference_id, balance_after)
    VALUES (p_user_id, p_amount, 'credit', p_provider, p_reference_id, new_balance);

    RETURN jsonb_build_object('success', true, 'new_balance', new_balance, 'already_processed', false);

EXCEPTION
    WHEN unique_violation THEN
        -- Duplicate event_id+provider -> already processed
        RETURN jsonb_build_object('success', true, 'already_processed', true);
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Fix add_credits to also log into credit_transactions
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

    -- Credit transaction log (for Credit History UI)
    INSERT INTO credit_transactions (user_id, amount, transaction_type, source, reference_id, balance_after)
    VALUES (p_user_id, p_amount, 'credit', p_source, p_reference_id, new_balance);

    RETURN new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Fix safe_deduct_credits to also log into credit_transactions
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

    -- Credit transaction log (for Credit History UI)
    INSERT INTO credit_transactions (user_id, amount, transaction_type, source, reference_id, balance_after)
    VALUES (p_user_id, -p_amount, 'debit', p_reason, NULL, new_balance);

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
