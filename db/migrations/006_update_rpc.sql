-- Migration: Update RPC signature to include validation status
CREATE OR REPLACE FUNCTION convert_invoice_with_credit_deduction(
    p_user_id UUID,
    p_conversion_id UUID,
    p_credits_cost INTEGER DEFAULT 1,
    p_validation_status TEXT DEFAULT NULL,
    p_validation_errors JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_available_credits INTEGER;
    v_updated_credits INTEGER;
    v_conversion_exists BOOLEAN;
    v_current_status TEXT;
BEGIN
    -- 1. Check if conversion exists and belongs to user
    SELECT EXISTS(
        SELECT 1 FROM invoice_conversions
        WHERE id = p_conversion_id AND user_id = p_user_id
    ) INTO v_conversion_exists;

    IF NOT v_conversion_exists THEN
        RAISE EXCEPTION 'Conversion % not found for user %', p_conversion_id, p_user_id;
    END IF;

    -- 2. Check current status to prevent double deduction
    SELECT conversion_status INTO v_current_status
    FROM invoice_conversions
    WHERE id = p_conversion_id;

    IF v_current_status = 'completed' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already completed');
    END IF;

    -- 3. Lock user credits row and check balance
    SELECT available_credits INTO v_available_credits
    FROM user_credits
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_available_credits IS NULL THEN
        RAISE EXCEPTION 'User credits record not found';
    END IF;

    IF v_available_credits < p_credits_cost THEN
        RAISE EXCEPTION 'Insufficient credits: % available, % required', v_available_credits, p_credits_cost;
    END IF;

    -- 4. Deduct credits
    UPDATE user_credits
    SET available_credits = available_credits - p_credits_cost,
        used_credits = used_credits + p_credits_cost,
        updated_at = NOW()
    WHERE user_id = p_user_id
    RETURNING available_credits INTO v_updated_credits;

    -- 5. Update conversion status locally (including validation results if provided)
    UPDATE invoice_conversions
    SET conversion_status = 'completed',
        credits_used = p_credits_cost,
        validation_status = COALESCE(p_validation_status, validation_status),
        validation_errors = COALESCE(p_validation_errors, validation_errors),
        updated_at = NOW()
    WHERE id = p_conversion_id;

    -- 6. Log transaction
    INSERT INTO audit_logs (user_id, action, resource_type, resource_id, changes)
    VALUES (
        p_user_id,
        'deduct_credits_conversion',
        'invoice_conversions',
        p_conversion_id::text,
        jsonb_build_object(
            'cost', p_credits_cost,
            'remaining', v_updated_credits,
            'validation_status', p_validation_status
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'remaining_credits', v_updated_credits,
        'deducted', p_credits_cost
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM,
            'code', SQLSTATE
        );
END;
$$;
