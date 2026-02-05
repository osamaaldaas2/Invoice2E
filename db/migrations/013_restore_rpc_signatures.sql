-- Migration: 013_restore_rpc_signatures.sql
-- Purpose: Restore RPC function signatures to match service code
-- Fixes:
--   - safe_deduct_credits missing p_reason parameter
--   - convert_invoice_with_credit_deduction signature mismatch (2 params → 3 params, BOOLEAN → JSONB)
--   - Adds stripe_session_id column for proper payment tracking

-- =============================================
-- RESTORE safe_deduct_credits WITH p_reason
-- =============================================

-- Drop the 2-parameter version
DROP FUNCTION IF EXISTS safe_deduct_credits(UUID, INTEGER) CASCADE;

-- Create with 3 parameters to match service code
CREATE FUNCTION safe_deduct_credits(
    p_user_id UUID,
    p_amount INTEGER DEFAULT 1,
    p_reason VARCHAR(255) DEFAULT 'conversion'
) RETURNS BOOLEAN AS $$
DECLARE
    v_current_balance INTEGER;
BEGIN
    -- Get current balance with row lock
    SELECT available_credits INTO v_current_balance
    FROM public.user_credits
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_current_balance IS NULL OR v_current_balance < p_amount THEN
        RETURN FALSE;
    END IF;

    -- Deduct credits
    UPDATE public.user_credits
    SET available_credits = available_credits - p_amount,
        used_credits = used_credits + p_amount
    WHERE user_id = p_user_id;

    -- Log the transaction
    BEGIN
        INSERT INTO public.credit_transactions (user_id, amount, transaction_type, source, balance_after)
        VALUES (p_user_id, -p_amount, 'debit', p_reason, v_current_balance - p_amount);
    EXCEPTION WHEN undefined_table THEN
        -- Table doesn't exist, skip logging
        NULL;
    END;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';

-- =============================================
-- RESTORE convert_invoice_with_credit_deduction
-- =============================================

-- Drop the 2-parameter BOOLEAN version
DROP FUNCTION IF EXISTS convert_invoice_with_credit_deduction(UUID, UUID) CASCADE;

-- Create with 3 parameters and JSONB return to match service code
CREATE FUNCTION convert_invoice_with_credit_deduction(
    p_user_id UUID,
    p_conversion_id UUID,
    p_credits_cost INTEGER DEFAULT 1
) RETURNS JSONB AS $$
DECLARE
    v_current_credits INTEGER;
    v_deducted BOOLEAN;
BEGIN
    -- Try to deduct credits
    SELECT public.safe_deduct_credits(p_user_id, p_credits_cost, 'conversion') INTO v_deducted;

    IF NOT v_deducted THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Insufficient credits'
        );
    END IF;

    -- Get remaining credits
    SELECT available_credits INTO v_current_credits
    FROM public.user_credits
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'remaining_credits', COALESCE(v_current_credits, 0)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';

-- =============================================
-- ADD stripe_session_id COLUMN
-- =============================================

-- Add column for storing Stripe session ID separately from payment intent
ALTER TABLE payment_transactions
ADD COLUMN IF NOT EXISTS stripe_session_id VARCHAR(255);

-- Create index for lookups
CREATE INDEX IF NOT EXISTS idx_payment_transactions_stripe_session_id
ON payment_transactions(stripe_session_id)
WHERE stripe_session_id IS NOT NULL;

-- =============================================
-- VERIFICATION
-- =============================================

DO $$
BEGIN
    RAISE NOTICE 'Migration 013 completed:';
    RAISE NOTICE '  - safe_deduct_credits restored with p_reason parameter';
    RAISE NOTICE '  - convert_invoice_with_credit_deduction restored with 3 params and JSONB return';
    RAISE NOTICE '  - stripe_session_id column added to payment_transactions';
END $$;
