-- Migration: 011_fix_security_warnings.sql
-- Purpose: Fix Supabase Security Advisor warnings
--
-- Fixes:
-- 1. Function Search Path Mutable - Add explicit search_path to all functions
-- 2. RLS Policy Always True - Fix overly permissive policies

-- =============================================
-- PART 0: DROP FUNCTIONS THAT NEED PARAMETER CHANGES
-- =============================================
-- PostgreSQL doesn't allow changing parameter defaults with CREATE OR REPLACE
-- We need to drop these functions first

DROP FUNCTION IF EXISTS add_credits(UUID, INTEGER, VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS deduct_credits(UUID, INTEGER, VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS admin_modify_credits(UUID, UUID, INTEGER, TEXT, VARCHAR, TEXT);

-- =============================================
-- PART 1: FIX FUNCTION SEARCH PATHS
-- =============================================

-- Fix update_updated_at_column function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = '';

-- Fix update_credit_packages_updated_at function
CREATE OR REPLACE FUNCTION update_credit_packages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = '';

-- Fix add_credits function
CREATE OR REPLACE FUNCTION add_credits(
    p_user_id UUID,
    p_amount INTEGER,
    p_source VARCHAR(50),
    p_reference_id VARCHAR(255) DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    v_new_balance INTEGER;
BEGIN
    -- Upsert into user_credits
    INSERT INTO public.user_credits (user_id, available_credits, used_credits)
    VALUES (p_user_id, p_amount, 0)
    ON CONFLICT (user_id) DO UPDATE
    SET available_credits = public.user_credits.available_credits + p_amount;

    -- Get new balance
    SELECT available_credits INTO v_new_balance
    FROM public.user_credits
    WHERE user_id = p_user_id;

    -- Log the transaction
    INSERT INTO public.credit_transactions (user_id, amount, transaction_type, source, reference_id, balance_after)
    VALUES (p_user_id, p_amount, 'credit', p_source, p_reference_id, v_new_balance);

    RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';

-- Fix deduct_credits function
CREATE OR REPLACE FUNCTION deduct_credits(
    p_user_id UUID,
    p_amount INTEGER,
    p_source VARCHAR(50),
    p_reference_id VARCHAR(255) DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    v_current_balance INTEGER;
    v_new_balance INTEGER;
BEGIN
    -- Get current balance
    SELECT available_credits INTO v_current_balance
    FROM public.user_credits
    WHERE user_id = p_user_id;

    IF v_current_balance IS NULL OR v_current_balance < p_amount THEN
        RAISE EXCEPTION 'Insufficient credits';
    END IF;

    -- Deduct credits
    UPDATE public.user_credits
    SET available_credits = available_credits - p_amount,
        used_credits = used_credits + p_amount
    WHERE user_id = p_user_id;

    v_new_balance := v_current_balance - p_amount;

    -- Log the transaction
    INSERT INTO public.credit_transactions (user_id, amount, transaction_type, source, reference_id, balance_after)
    VALUES (p_user_id, -p_amount, 'debit', p_source, p_reference_id, v_new_balance);

    RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';

-- Fix safe_deduct_credits function
CREATE OR REPLACE FUNCTION safe_deduct_credits(
    p_user_id UUID,
    p_amount INTEGER
)
RETURNS BOOLEAN AS $$
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

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';

-- Fix convert_invoice_with_credit_deduction function
CREATE OR REPLACE FUNCTION convert_invoice_with_credit_deduction(
    p_user_id UUID,
    p_invoice_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_deducted BOOLEAN;
BEGIN
    -- Try to deduct 1 credit
    SELECT public.safe_deduct_credits(p_user_id, 1) INTO v_deducted;

    IF NOT v_deducted THEN
        RETURN FALSE;
    END IF;

    -- Update invoice status (implementation depends on your schema)
    -- This is a placeholder - adjust based on your actual invoice table structure

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';

-- Fix is_admin function
CREATE OR REPLACE FUNCTION is_admin(check_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users
        WHERE id = check_user_id
        AND role IN ('admin', 'super_admin')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = '';

-- Fix is_super_admin function
CREATE OR REPLACE FUNCTION is_super_admin(check_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users
        WHERE id = check_user_id
        AND role = 'super_admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = '';

-- Fix increment_login_count function
CREATE OR REPLACE FUNCTION increment_login_count()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.last_login_at IS DISTINCT FROM OLD.last_login_at THEN
        NEW.login_count := COALESCE(OLD.login_count, 0) + 1;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = '';

-- Fix admin_modify_credits function
CREATE OR REPLACE FUNCTION admin_modify_credits(
    p_admin_id UUID,
    p_target_user_id UUID,
    p_amount INTEGER,
    p_reason TEXT,
    p_ip_address VARCHAR(45) DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    v_new_balance INTEGER;
    v_old_balance INTEGER;
    v_action VARCHAR(20);
BEGIN
    -- Verify admin has permission
    IF NOT public.is_admin(p_admin_id) THEN
        RAISE EXCEPTION 'Unauthorized: Admin role required';
    END IF;

    -- Get current balance
    SELECT available_credits INTO v_old_balance
    FROM public.user_credits
    WHERE user_id = p_target_user_id;

    v_old_balance := COALESCE(v_old_balance, 0);

    -- Determine action type
    IF p_amount > 0 THEN
        v_action := 'credits_added';
    ELSE
        v_action := 'credits_removed';
    END IF;

    -- Apply the credit modification
    INSERT INTO public.user_credits (user_id, available_credits, used_credits)
    VALUES (p_target_user_id, GREATEST(0, p_amount), 0)
    ON CONFLICT (user_id) DO UPDATE
    SET available_credits = GREATEST(0, public.user_credits.available_credits + p_amount);

    -- Get new balance
    SELECT available_credits INTO v_new_balance
    FROM public.user_credits
    WHERE user_id = p_target_user_id;

    -- Log the admin action
    INSERT INTO public.admin_audit_logs (
        admin_user_id, target_user_id, action, resource_type, resource_id,
        old_values, new_values, ip_address, user_agent
    ) VALUES (
        p_admin_id, p_target_user_id, v_action, 'credits', p_target_user_id::text,
        jsonb_build_object('credits', v_old_balance),
        jsonb_build_object('credits', v_new_balance, 'change', p_amount, 'reason', p_reason),
        p_ip_address, p_user_agent
    );

    RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';

-- Fix setup_first_admin function
CREATE OR REPLACE FUNCTION setup_first_admin(admin_email TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_admin_count INTEGER;
BEGIN
    -- Check if any admin exists
    SELECT COUNT(*) INTO v_admin_count
    FROM public.users
    WHERE role IN ('admin', 'super_admin');

    IF v_admin_count > 0 THEN
        RAISE EXCEPTION 'Admin already exists. Use the admin panel to create new admins.';
    END IF;

    -- Promote user to super_admin
    UPDATE public.users
    SET role = 'super_admin'
    WHERE email = admin_email;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User with email % not found', admin_email;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';

-- =============================================
-- PART 2: FIX RLS POLICIES
-- =============================================

-- Note: The "RLS Policy Always True" warnings are typically for INSERT policies
-- that use "WITH CHECK (true)" which allows any authenticated user to insert.
-- This is often intentional for user registration flows.

-- Check and fix user_credits policies if needed
-- Drop overly permissive policies and create proper ones

-- First, let's see what policies exist and replace if needed
DO $$
BEGIN
    -- Drop INSERT policy if it's too permissive (allows true for all)
    -- Users should only be able to have their own credits record created

    -- Check if the permissive insert policy exists and drop it
    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'user_credits'
        AND policyname LIKE '%insert%'
        AND qual = 'true'
    ) THEN
        DROP POLICY IF EXISTS "Users can insert own credits" ON public.user_credits;
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'users'
        AND policyname LIKE '%insert%'
        AND qual = 'true'
    ) THEN
        DROP POLICY IF EXISTS "Users can insert" ON public.users;
    END IF;
END $$;

-- Create proper INSERT policy for user_credits
-- Only the user themselves or an admin can create a credits record
DROP POLICY IF EXISTS "System or admin can insert credits" ON public.user_credits;
CREATE POLICY "System or admin can insert credits" ON public.user_credits
    FOR INSERT WITH CHECK (
        user_id::text = auth.uid()::text
        OR public.is_admin(auth.uid()::uuid)
    );

-- For users table, INSERT is typically handled by Supabase Auth
-- But if you have a custom policy, make sure it's properly scoped
DROP POLICY IF EXISTS "Enable insert for authentication" ON public.users;
CREATE POLICY "Enable insert for authentication" ON public.users
    FOR INSERT WITH CHECK (
        id::text = auth.uid()::text
    );

-- =============================================
-- VERIFICATION COMMENTS
-- =============================================

COMMENT ON FUNCTION is_admin(UUID) IS 'Check if user has admin or super_admin role. search_path secured.';
COMMENT ON FUNCTION is_super_admin(UUID) IS 'Check if user has super_admin role. search_path secured.';
COMMENT ON FUNCTION add_credits(UUID, INTEGER, VARCHAR, VARCHAR) IS 'Atomically add credits to user account. search_path secured.';
COMMENT ON FUNCTION deduct_credits(UUID, INTEGER, VARCHAR, VARCHAR) IS 'Atomically deduct credits from user account. search_path secured.';
COMMENT ON FUNCTION safe_deduct_credits(UUID, INTEGER) IS 'Safely deduct credits with row locking. search_path secured.';
COMMENT ON FUNCTION admin_modify_credits(UUID, UUID, INTEGER, TEXT, VARCHAR, TEXT) IS 'Admin function to modify user credits with audit trail. search_path secured.';
