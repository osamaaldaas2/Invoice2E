-- S2: Fix extract_with_credit_deduction RPC
-- Issues in original (20260217220300):
--   1. credit_transactions INSERT used 'type' instead of 'transaction_type'
--   2. credit_transactions INSERT missing balance_after, idempotency_key columns
--   3. invoice_extractions INSERT references file_name, file_hash columns that don't exist
-- Fix: add missing columns + rewrite RPC to match proven safe_deduct_credits pattern

-- Step 1: Add file_name and file_hash columns to invoice_extractions
ALTER TABLE invoice_extractions ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE invoice_extractions ADD COLUMN IF NOT EXISTS file_hash TEXT;

-- Index for idempotency lookups (same user + same file hash within time window)
CREATE INDEX IF NOT EXISTS idx_extractions_user_file_hash
    ON invoice_extractions (user_id, file_hash, created_at)
    WHERE file_hash IS NOT NULL;

-- Step 2: Fix the single-extraction atomic RPC
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
    v_new_balance INT;
BEGIN
    -- Idempotency: check if this file was already processed recently
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

        -- Also check credit_transactions idempotency
        IF EXISTS (SELECT 1 FROM credit_transactions WHERE idempotency_key = p_idempotency_key) THEN
            RETURN jsonb_build_object(
                'status', 'already_processed',
                'extraction_id', NULL
            );
        END IF;
    END IF;

    -- Lock and check credits (same pattern as safe_deduct_credits)
    SELECT available_credits INTO v_current_credits
    FROM user_credits
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'error', 'User credits record not found');
    END IF;

    IF v_current_credits < p_amount THEN
        RETURN jsonb_build_object('status', 'insufficient_credits', 'available', v_current_credits, 'required', p_amount);
    END IF;

    -- Deduct credits
    UPDATE user_credits
    SET available_credits = available_credits - p_amount,
        used_credits = used_credits + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id
    RETURNING available_credits INTO v_new_balance;

    -- Create extraction record (status = 'pending', AI extraction happens after)
    INSERT INTO invoice_extractions (user_id, file_name, file_hash, extraction_data, status, created_at, updated_at)
    VALUES (p_user_id, p_file_name, p_file_hash, p_extraction_data, 'pending', NOW(), NOW())
    RETURNING id INTO v_extraction_id;

    -- Record credit transaction (matches safe_deduct_credits column pattern exactly)
    INSERT INTO credit_transactions (user_id, amount, transaction_type, source, reference_id, balance_after, idempotency_key)
    VALUES (p_user_id, -p_amount, 'debit', p_reason, v_extraction_id::text, v_new_balance, p_idempotency_key);

    -- Audit log
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
            'new_balance', v_new_balance
        )
    );

    RETURN jsonb_build_object(
        'status', 'success',
        'extraction_id', v_extraction_id,
        'credits_remaining', v_new_balance
    );
END;
$$;

-- Step 3: Batch variant — deducts N credits and creates N extraction records atomically
CREATE OR REPLACE FUNCTION batch_extract_with_credit_deduction(
    p_user_id UUID,
    p_amount INT,
    p_reason TEXT,
    p_idempotency_key TEXT,
    p_file_name TEXT,
    p_file_hash TEXT,
    p_invoice_count INT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_credits INT;
    v_new_balance INT;
    v_extraction_ids UUID[] := '{}';
    v_ext_id UUID;
    i INT;
BEGIN
    IF p_invoice_count <= 0 THEN
        RETURN jsonb_build_object('status', 'error', 'error', 'invoice_count must be positive');
    END IF;

    -- Idempotency check on credit_transactions
    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM credit_transactions WHERE idempotency_key = p_idempotency_key) THEN
            RETURN jsonb_build_object('status', 'already_processed');
        END IF;
    END IF;

    -- Lock and check credits
    SELECT available_credits INTO v_current_credits
    FROM user_credits
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'error', 'User credits record not found');
    END IF;

    IF v_current_credits < p_amount THEN
        RETURN jsonb_build_object('status', 'insufficient_credits', 'available', v_current_credits, 'required', p_amount);
    END IF;

    -- Deduct all credits at once
    UPDATE user_credits
    SET available_credits = available_credits - p_amount,
        used_credits = used_credits + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id
    RETURNING available_credits INTO v_new_balance;

    -- Create N extraction records
    FOR i IN 1..p_invoice_count LOOP
        INSERT INTO invoice_extractions (user_id, file_name, file_hash, extraction_data, status, created_at, updated_at)
        VALUES (p_user_id, p_file_name || ' [' || i || '/' || p_invoice_count || ']', p_file_hash, '{}'::jsonb, 'pending', NOW(), NOW())
        RETURNING id INTO v_ext_id;
        v_extraction_ids := v_extraction_ids || v_ext_id;
    END LOOP;

    -- Single credit transaction for the batch
    INSERT INTO credit_transactions (user_id, amount, transaction_type, source, reference_id, balance_after, idempotency_key)
    VALUES (p_user_id, -p_amount, 'debit', p_reason, v_extraction_ids[1]::text, v_new_balance, p_idempotency_key);

    -- Audit log
    INSERT INTO audit_logs (user_id, action, resource_type, changes)
    VALUES (
        p_user_id,
        'credits_deducted',
        'user_credits',
        jsonb_build_object(
            'amount', p_amount,
            'reason', p_reason,
            'invoice_count', p_invoice_count,
            'extraction_ids', to_jsonb(v_extraction_ids),
            'new_balance', v_new_balance
        )
    );

    RETURN jsonb_build_object(
        'status', 'success',
        'extraction_ids', to_jsonb(v_extraction_ids),
        'credits_remaining', v_new_balance
    );
END;
$$;

GRANT EXECUTE ON FUNCTION extract_with_credit_deduction(UUID, INT, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION batch_extract_with_credit_deduction(UUID, INT, TEXT, TEXT, TEXT, TEXT, INT) TO service_role;
