-- FIX: Audit #014, #015 — idempotent credit refund
-- Prevents double-refund even under concurrent retries

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
    WHERE user_id = p_user_id;

    INSERT INTO credit_transactions (user_id, amount, type, source, idempotency_key, created_at)
    VALUES (p_user_id, p_amount, 'refund', p_reason, p_idempotency_key, NOW());

    RETURN jsonb_build_object('status', 'refunded', 'amount', p_amount);
END;
$$;

GRANT EXECUTE ON FUNCTION refund_credits_idempotent(UUID, INT, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION refund_credits_idempotent IS 'FIX: Audit #014, #015 — idempotent credit refund with dedup via idempotency_key';
