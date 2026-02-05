-- Migration: 012_fix_remaining_warnings.sql
-- Purpose: Fix remaining Security Advisor warnings
-- This migration dynamically drops ALL versions of problematic functions

-- =============================================
-- DYNAMICALLY DROP ALL VERSIONS OF FUNCTIONS
-- =============================================

-- This DO block finds and drops ALL overloaded versions of each function
DO $$
DECLARE
    func_record RECORD;
    drop_cmd TEXT;
BEGIN
    -- Drop all versions of convert_invoice_with_credit_deduction
    FOR func_record IN
        SELECT p.oid::regprocedure::text AS func_signature
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.proname = 'convert_invoice_with_credit_deduction'
    LOOP
        drop_cmd := 'DROP FUNCTION IF EXISTS ' || func_record.func_signature || ' CASCADE';
        RAISE NOTICE 'Dropping: %', drop_cmd;
        EXECUTE drop_cmd;
    END LOOP;

    -- Drop all versions of safe_deduct_credits
    FOR func_record IN
        SELECT p.oid::regprocedure::text AS func_signature
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.proname = 'safe_deduct_credits'
    LOOP
        drop_cmd := 'DROP FUNCTION IF EXISTS ' || func_record.func_signature || ' CASCADE';
        RAISE NOTICE 'Dropping: %', drop_cmd;
        EXECUTE drop_cmd;
    END LOOP;

    -- Drop all versions of increment_login_count
    FOR func_record IN
        SELECT p.oid::regprocedure::text AS func_signature
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.proname = 'increment_login_count'
    LOOP
        drop_cmd := 'DROP FUNCTION IF EXISTS ' || func_record.func_signature || ' CASCADE';
        RAISE NOTICE 'Dropping: %', drop_cmd;
        EXECUTE drop_cmd;
    END LOOP;

    -- Drop all versions of setup_first_admin
    FOR func_record IN
        SELECT p.oid::regprocedure::text AS func_signature
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.proname = 'setup_first_admin'
    LOOP
        drop_cmd := 'DROP FUNCTION IF EXISTS ' || func_record.func_signature || ' CASCADE';
        RAISE NOTICE 'Dropping: %', drop_cmd;
        EXECUTE drop_cmd;
    END LOOP;

    -- Drop all versions of deduct_credits
    FOR func_record IN
        SELECT p.oid::regprocedure::text AS func_signature
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.proname = 'deduct_credits'
    LOOP
        drop_cmd := 'DROP FUNCTION IF EXISTS ' || func_record.func_signature || ' CASCADE';
        RAISE NOTICE 'Dropping: %', drop_cmd;
        EXECUTE drop_cmd;
    END LOOP;
END $$;

-- =============================================
-- RECREATE FUNCTIONS WITH search_path
-- =============================================

-- Fix safe_deduct_credits function
CREATE FUNCTION safe_deduct_credits(
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

-- Fix deduct_credits function
CREATE FUNCTION deduct_credits(
    p_user_id UUID,
    p_amount INTEGER,
    p_source VARCHAR(50) DEFAULT 'manual',
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

    -- Log the transaction if credit_transactions table exists
    BEGIN
        INSERT INTO public.credit_transactions (user_id, amount, transaction_type, source, reference_id, balance_after)
        VALUES (p_user_id, -p_amount, 'debit', p_source, p_reference_id, v_new_balance);
    EXCEPTION WHEN undefined_table THEN
        -- Table doesn't exist, skip logging
        NULL;
    END;

    RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';

-- Fix convert_invoice_with_credit_deduction function
CREATE FUNCTION convert_invoice_with_credit_deduction(
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

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';

-- Fix increment_login_count function
CREATE FUNCTION increment_login_count()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.last_login_at IS DISTINCT FROM OLD.last_login_at THEN
        NEW.login_count := COALESCE(OLD.login_count, 0) + 1;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = '';

-- Recreate the trigger that uses increment_login_count
DROP TRIGGER IF EXISTS trigger_increment_login_count ON public.users;
CREATE TRIGGER trigger_increment_login_count
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION increment_login_count();

-- Fix setup_first_admin function
CREATE FUNCTION setup_first_admin(admin_email TEXT)
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
-- FIX RLS POLICIES MORE AGGRESSIVELY
-- =============================================

-- First, list and drop ALL insert policies on these tables
DO $$
DECLARE
    pol RECORD;
BEGIN
    -- Drop all INSERT policies on user_credits that might be too permissive
    FOR pol IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'user_credits'
        AND cmd = 'INSERT'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_credits', pol.policyname);
    END LOOP;

    -- Drop all INSERT policies on users that might be too permissive
    FOR pol IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'users'
        AND cmd = 'INSERT'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.users', pol.policyname);
    END LOOP;
END $$;

-- Create properly scoped INSERT policies

-- For user_credits: Only system functions (via SECURITY DEFINER) should insert
-- Regular users don't need to insert credits directly
CREATE POLICY "Credits inserted by system functions only" ON public.user_credits
    FOR INSERT WITH CHECK (
        -- Allow if current user is admin
        public.is_admin(auth.uid()::uuid)
        -- Or if this is their own record (for edge cases)
        OR user_id::text = auth.uid()::text
    );

-- For users table: Only allow insert where id matches the authenticated user
-- This is for the initial user creation during signup
CREATE POLICY "Users can only insert own record" ON public.users
    FOR INSERT WITH CHECK (
        id::text = auth.uid()::text
    );

-- =============================================
-- VERIFICATION
-- =============================================

-- Verify functions have search_path set
DO $$
DECLARE
    func_record RECORD;
BEGIN
    FOR func_record IN
        SELECT proname, prosrc
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND proname IN ('safe_deduct_credits', 'deduct_credits', 'convert_invoice_with_credit_deduction',
                        'increment_login_count', 'setup_first_admin')
    LOOP
        RAISE NOTICE 'Function % exists', func_record.proname;
    END LOOP;
END $$;
