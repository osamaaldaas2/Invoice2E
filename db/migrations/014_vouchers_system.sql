-- Migration: 014_vouchers_system.sql
-- Purpose: Add voucher (redeem code) system with admin control and redemption logging

-- =============================================
-- VOUCHERS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS public.vouchers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) NOT NULL,
    description TEXT,
    credits INTEGER NOT NULL CHECK (credits > 0),
    is_active BOOLEAN DEFAULT TRUE,
    applies_to_all BOOLEAN DEFAULT TRUE,
    allowed_user_ids UUID[],
    max_redemptions INTEGER,
    max_redemptions_per_user INTEGER,
    valid_from TIMESTAMP,
    valid_until TIMESTAMP,
    redemption_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vouchers_code_lower
    ON public.vouchers (LOWER(code));

CREATE INDEX IF NOT EXISTS idx_vouchers_active
    ON public.vouchers (is_active);

CREATE INDEX IF NOT EXISTS idx_vouchers_valid_until
    ON public.vouchers (valid_until);

ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_vouchers_updated_at
    BEFORE UPDATE ON public.vouchers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- VOUCHER REDEMPTIONS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS public.voucher_redemptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    voucher_id UUID NOT NULL REFERENCES public.vouchers(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    credits_added INTEGER NOT NULL CHECK (credits_added > 0),
    redeemed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_voucher
    ON public.voucher_redemptions (voucher_id);

CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_user
    ON public.voucher_redemptions (user_id);

CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_user_voucher
    ON public.voucher_redemptions (user_id, voucher_id);

ALTER TABLE public.voucher_redemptions ENABLE ROW LEVEL SECURITY;

-- =============================================
-- REDEEM FUNCTION (ATOMIC)
-- =============================================

DROP FUNCTION IF EXISTS redeem_voucher(UUID, VARCHAR);

CREATE FUNCTION redeem_voucher(
    p_user_id UUID,
    p_code VARCHAR
)
RETURNS JSONB AS $$
DECLARE
    v_voucher RECORD;
    v_user_redemptions INTEGER;
    v_now TIMESTAMP := CURRENT_TIMESTAMP;
    v_new_balance INTEGER;
BEGIN
    SELECT *
    INTO v_voucher
    FROM public.vouchers
    WHERE LOWER(code) = LOWER(TRIM(p_code))
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Voucher not found');
    END IF;

    IF v_voucher.is_active IS DISTINCT FROM TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Voucher is inactive');
    END IF;

    IF v_voucher.valid_from IS NOT NULL AND v_now < v_voucher.valid_from THEN
        RETURN jsonb_build_object('success', false, 'error', 'Voucher not active yet');
    END IF;

    IF v_voucher.valid_until IS NOT NULL AND v_now > v_voucher.valid_until THEN
        RETURN jsonb_build_object('success', false, 'error', 'Voucher has expired');
    END IF;

    IF v_voucher.applies_to_all IS NOT TRUE THEN
        IF v_voucher.allowed_user_ids IS NULL OR NOT (p_user_id = ANY(v_voucher.allowed_user_ids)) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Voucher not available for this user');
        END IF;
    END IF;

    IF v_voucher.max_redemptions IS NOT NULL AND v_voucher.max_redemptions > 0 THEN
        IF v_voucher.redemption_count >= v_voucher.max_redemptions THEN
            RETURN jsonb_build_object('success', false, 'error', 'Voucher redemption limit reached');
        END IF;
    END IF;

    IF v_voucher.max_redemptions_per_user IS NOT NULL AND v_voucher.max_redemptions_per_user > 0 THEN
        SELECT COUNT(*) INTO v_user_redemptions
        FROM public.voucher_redemptions
        WHERE voucher_id = v_voucher.id AND user_id = p_user_id;

        IF v_user_redemptions >= v_voucher.max_redemptions_per_user THEN
            RETURN jsonb_build_object('success', false, 'error', 'Voucher already redeemed by user');
        END IF;
    END IF;

    INSERT INTO public.voucher_redemptions (voucher_id, user_id, credits_added)
    VALUES (v_voucher.id, p_user_id, v_voucher.credits);

    UPDATE public.vouchers
    SET redemption_count = redemption_count + 1
    WHERE id = v_voucher.id;

    SELECT public.add_credits(p_user_id, v_voucher.credits, 'voucher', v_voucher.code)
    INTO v_new_balance;

    RETURN jsonb_build_object(
        'success', true,
        'voucher_id', v_voucher.id,
        'credits_added', v_voucher.credits,
        'new_balance', v_new_balance
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';

GRANT EXECUTE ON FUNCTION redeem_voucher(UUID, VARCHAR) TO service_role;

COMMENT ON FUNCTION redeem_voucher IS 'Redeem a voucher code atomically, add credits, and log redemption.';

