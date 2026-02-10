-- Migration 026: Atomic verify_and_add_credits RPC
-- Fixes race condition where verify endpoint and webhook can both add credits simultaneously.
-- The idempotency marker (webhook_events insert) now happens INSIDE the same transaction as
-- the credit addition, eliminating the race window.

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

    RETURN jsonb_build_object('success', true, 'new_balance', new_balance, 'already_processed', false);

EXCEPTION
    WHEN unique_violation THEN
        -- Duplicate event_id+provider -> already processed
        RETURN jsonb_build_object('success', true, 'already_processed', true);
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
