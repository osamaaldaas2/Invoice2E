-- FIX: Audit #005, #010 — atomic credit deduction + extraction creation
-- Ensures credits and extraction are created in a single transaction.
-- If extraction insert fails, credits are automatically rolled back.

CREATE OR REPLACE FUNCTION extract_with_credit_deduction(
    p_user_id UUID,
    p_amount INT,
    p_reason TEXT,
    p_idempotency_key TEXT,
    p_file_name TEXT,
    p_file_hash TEXT,
    p_extraction_data JSONB DEFAULT '{}'::JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_extraction_id UUID;
    v_current_credits INT;
BEGIN
    -- Check idempotency first
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_extraction_id
        FROM invoice_extractions
        WHERE file_hash = p_file_hash
          AND user_id = p_user_id
          AND created_at > NOW() - INTERVAL '1 hour';

        IF v_extraction_id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'status', 'already_processed',
                'extraction_id', v_extraction_id
            );
        END IF;
    END IF;

    -- Lock and check credits
    SELECT available_credits INTO v_current_credits
    FROM user_credits
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_current_credits IS NULL THEN
        RAISE EXCEPTION 'User credits record not found';
    END IF;

    IF v_current_credits < p_amount THEN
        RAISE EXCEPTION 'Insufficient credits: have %, need %', v_current_credits, p_amount;
    END IF;

    -- Deduct credits
    UPDATE user_credits
    SET available_credits = available_credits - p_amount,
        used_credits = used_credits + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- Record credit transaction
    INSERT INTO credit_transactions (user_id, amount, type, source, created_at)
    VALUES (p_user_id, -p_amount, 'deduction', p_reason, NOW());

    -- Create extraction record
    INSERT INTO invoice_extractions (user_id, file_name, file_hash, status, created_at)
    VALUES (p_user_id, p_file_name, p_file_hash, 'pending', NOW())
    RETURNING id INTO v_extraction_id;

    -- Log to audit
    INSERT INTO audit_logs (user_id, action, resource_type, resource_id, changes)
    VALUES (
        p_user_id,
        'credits_deducted',
        'user_credits',
        v_extraction_id::text,
        jsonb_build_object(
            'amount', p_amount,
            'reason', p_reason,
            'extraction_id', v_extraction_id,
            'new_balance', v_current_credits - p_amount
        )
    );

    RETURN jsonb_build_object(
        'status', 'success',
        'extraction_id', v_extraction_id,
        'credits_remaining', v_current_credits - p_amount
    );
END;
$$;

-- Grant to service_role only
GRANT EXECUTE ON FUNCTION extract_with_credit_deduction(UUID, INT, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;

COMMENT ON FUNCTION extract_with_credit_deduction IS 'FIX: Audit #005, #010 — atomic credit deduction + extraction creation in single transaction';
