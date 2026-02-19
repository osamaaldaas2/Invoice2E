-- FIX: refund_credits_idempotent used wrong column name 'type' instead of 'transaction_type'
-- Also adds balance_after tracking for consistency with other credit RPCs

CREATE OR REPLACE FUNCTION refund_credits_idempotent(
    p_user_id UUID,
    p_amount INT,
    p_reason TEXT,
    p_idempotency_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing BOOLEAN;
    v_new_balance INT;
BEGIN
    -- Check if this refund was already processed
    IF p_idempotency_key IS NOT NULL THEN
        SELECT EXISTS(
            SELECT 1 FROM credit_transactions
            WHERE idempotency_key = p_idempotency_key
        ) INTO v_existing;

        IF v_existing THEN
            RETURN jsonb_build_object('status', 'already_refunded');
        END IF;
    END IF;

    -- Process refund
    UPDATE user_credits
    SET available_credits = available_credits + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id
    RETURNING available_credits INTO v_new_balance;

    -- FIX: use transaction_type (not type) and include balance_after
    INSERT INTO credit_transactions (user_id, amount, transaction_type, source, balance_after, idempotency_key)
    VALUES (p_user_id, p_amount, 'refund', p_reason, v_new_balance, p_idempotency_key);

    RETURN jsonb_build_object('status', 'refunded', 'amount', p_amount);
END;
$$;

GRANT EXECUTE ON FUNCTION refund_credits_idempotent(UUID, INT, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION refund_credits_idempotent IS 'Idempotent credit refund with dedup via idempotency_key. Fixed: uses transaction_type column.';
