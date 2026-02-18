-- S0.6b: Add idempotency key support to safe_deduct_credits
-- Backward compatible: p_idempotency_key defaults to NULL
CREATE OR REPLACE FUNCTION safe_deduct_credits(
    p_user_id UUID,
    p_amount INTEGER DEFAULT 1,
    p_reason VARCHAR(255) DEFAULT 'conversion',
    p_idempotency_key TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    current_balance INTEGER;
    new_balance INTEGER;
    v_existing BOOLEAN;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Amount must be positive, got: %', p_amount;
    END IF;

    -- Idempotency check: if this key was already processed, return success without deducting
    IF p_idempotency_key IS NOT NULL THEN
        SELECT EXISTS(
            SELECT 1 FROM credit_transactions
            WHERE idempotency_key = p_idempotency_key
        ) INTO v_existing;
        IF v_existing THEN
            RETURN TRUE;
        END IF;
    END IF;

    SELECT available_credits INTO current_balance
    FROM user_credits WHERE user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN RETURN FALSE; END IF;
    IF current_balance < p_amount THEN RETURN FALSE; END IF;

    UPDATE user_credits
    SET available_credits = available_credits - p_amount,
        used_credits = used_credits + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id
    RETURNING available_credits INTO new_balance;

    INSERT INTO audit_logs (user_id, action, resource_type, changes)
    VALUES (p_user_id, 'credits_deducted', 'user_credits',
        jsonb_build_object('amount', p_amount, 'reason', p_reason, 'new_balance', new_balance));

    INSERT INTO credit_transactions (user_id, amount, transaction_type, source, reference_id, balance_after, idempotency_key)
    VALUES (p_user_id, -p_amount, 'debit', p_reason, NULL, new_balance, p_idempotency_key);

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
