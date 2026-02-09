-- Migration 022: Fix RLS performance warnings
-- 1. Replace auth.uid() with (select auth.uid()) for initplan optimization
-- 2. Drop duplicate/overlapping policies and consolidate into one per action

BEGIN;

-- ============================================================
-- TABLE: users
-- Drop ALL existing policies (3 current + old duplicates)
-- ============================================================
DROP POLICY IF EXISTS "Users can read own data" ON public.users;
DROP POLICY IF EXISTS "Users can view own user" ON public.users;
DROP POLICY IF EXISTS "Users can update own user" ON public.users;
DROP POLICY IF EXISTS "Users can view themselves or admins can view all" ON public.users;
DROP POLICY IF EXISTS "Users can update themselves or admins can update" ON public.users;
DROP POLICY IF EXISTS "Users can only insert own record" ON public.users;

CREATE POLICY "users_select" ON public.users
    FOR SELECT USING (
        id::text = (select auth.uid())::text
        OR is_admin((select auth.uid())::uuid)
    );

CREATE POLICY "users_update" ON public.users
    FOR UPDATE USING (
        id::text = (select auth.uid())::text
        OR is_admin((select auth.uid())::uuid)
    );

CREATE POLICY "users_insert" ON public.users
    FOR INSERT WITH CHECK (
        id::text = (select auth.uid())::text
    );

-- ============================================================
-- TABLE: user_credits
-- Drop ALL existing policies (3 current + old duplicates)
-- ============================================================
DROP POLICY IF EXISTS "Users can read own credits" ON public.user_credits;
DROP POLICY IF EXISTS "Users view own or admins view all credits" ON public.user_credits;
DROP POLICY IF EXISTS "Admins can update any credits" ON public.user_credits;
DROP POLICY IF EXISTS "Credits inserted by system functions only" ON public.user_credits;

CREATE POLICY "user_credits_select" ON public.user_credits
    FOR SELECT USING (
        user_id::text = (select auth.uid())::text
        OR is_admin((select auth.uid())::uuid)
    );

CREATE POLICY "user_credits_update" ON public.user_credits
    FOR UPDATE USING (
        is_admin((select auth.uid())::uuid)
    );

CREATE POLICY "user_credits_insert" ON public.user_credits
    FOR INSERT WITH CHECK (
        public.is_admin((select auth.uid())::uuid)
        OR user_id::text = (select auth.uid())::text
    );

-- ============================================================
-- TABLE: invoice_extractions
-- ============================================================
DROP POLICY IF EXISTS "Users can view own extractions" ON public.invoice_extractions;
DROP POLICY IF EXISTS "Users can insert own extractions" ON public.invoice_extractions;

CREATE POLICY "extractions_select" ON public.invoice_extractions
    FOR SELECT USING (user_id::text = (select auth.uid())::text);

CREATE POLICY "extractions_insert" ON public.invoice_extractions
    FOR INSERT WITH CHECK (user_id::text = (select auth.uid())::text);

-- ============================================================
-- TABLE: invoice_conversions
-- ============================================================
DROP POLICY IF EXISTS "Users view own or admins view all conversions" ON public.invoice_conversions;
DROP POLICY IF EXISTS "Users can insert own conversions" ON public.invoice_conversions;
DROP POLICY IF EXISTS "Users can update own conversions" ON public.invoice_conversions;

CREATE POLICY "conversions_select" ON public.invoice_conversions
    FOR SELECT USING (
        user_id::text = (select auth.uid())::text
        OR is_admin((select auth.uid())::uuid)
    );

CREATE POLICY "conversions_insert" ON public.invoice_conversions
    FOR INSERT WITH CHECK (user_id::text = (select auth.uid())::text);

CREATE POLICY "conversions_update" ON public.invoice_conversions
    FOR UPDATE USING (user_id::text = (select auth.uid())::text);

-- ============================================================
-- TABLE: payment_transactions
-- Drop ALL existing policies (2 current + old duplicates)
-- ============================================================
DROP POLICY IF EXISTS "Users can view own payment transactions" ON public.payment_transactions;
DROP POLICY IF EXISTS "Users view own or admins view all transactions" ON public.payment_transactions;
DROP POLICY IF EXISTS "Users can insert own payment transactions" ON public.payment_transactions;
DROP POLICY IF EXISTS "Admins can update transactions" ON public.payment_transactions;

CREATE POLICY "transactions_select" ON public.payment_transactions
    FOR SELECT USING (
        user_id::text = (select auth.uid())::text
        OR is_admin((select auth.uid())::uuid)
    );

CREATE POLICY "transactions_insert" ON public.payment_transactions
    FOR INSERT WITH CHECK (user_id::text = (select auth.uid())::text);

CREATE POLICY "transactions_update" ON public.payment_transactions
    FOR UPDATE USING (
        is_admin((select auth.uid())::uuid)
    );

-- ============================================================
-- TABLE: audit_logs
-- ============================================================
DROP POLICY IF EXISTS "Users can view own audit logs" ON public.audit_logs;

CREATE POLICY "audit_logs_select" ON public.audit_logs
    FOR SELECT USING (user_id::text = (select auth.uid())::text);

-- ============================================================
-- TABLE: batch_jobs
-- ============================================================
DROP POLICY IF EXISTS "Users can view own batch jobs" ON public.batch_jobs;
DROP POLICY IF EXISTS "Users can insert own batch jobs" ON public.batch_jobs;
DROP POLICY IF EXISTS "Users can update own batch jobs" ON public.batch_jobs;

CREATE POLICY "batch_jobs_select" ON public.batch_jobs
    FOR SELECT USING (user_id::text = (select auth.uid())::text);

CREATE POLICY "batch_jobs_insert" ON public.batch_jobs
    FOR INSERT WITH CHECK (user_id::text = (select auth.uid())::text);

CREATE POLICY "batch_jobs_update" ON public.batch_jobs
    FOR UPDATE USING (user_id::text = (select auth.uid())::text);

-- ============================================================
-- TABLE: user_templates
-- ============================================================
DROP POLICY IF EXISTS "Users can view own templates" ON public.user_templates;
DROP POLICY IF EXISTS "Users can insert own templates" ON public.user_templates;
DROP POLICY IF EXISTS "Users can update own templates" ON public.user_templates;
DROP POLICY IF EXISTS "Users can delete own templates" ON public.user_templates;

CREATE POLICY "templates_select" ON public.user_templates
    FOR SELECT USING (user_id::text = (select auth.uid())::text);

CREATE POLICY "templates_insert" ON public.user_templates
    FOR INSERT WITH CHECK (user_id::text = (select auth.uid())::text);

CREATE POLICY "templates_update" ON public.user_templates
    FOR UPDATE USING (user_id::text = (select auth.uid())::text);

CREATE POLICY "templates_delete" ON public.user_templates
    FOR DELETE USING (user_id::text = (select auth.uid())::text);

-- ============================================================
-- TABLE: credit_packages
-- ============================================================
DROP POLICY IF EXISTS "Anyone can view active packages" ON public.credit_packages;
DROP POLICY IF EXISTS "Admins can insert packages" ON public.credit_packages;
DROP POLICY IF EXISTS "Admins can update packages" ON public.credit_packages;
DROP POLICY IF EXISTS "Super admins can delete packages" ON public.credit_packages;

CREATE POLICY "packages_select" ON public.credit_packages
    FOR SELECT USING (is_active = TRUE OR is_admin((select auth.uid())::uuid));

CREATE POLICY "packages_insert" ON public.credit_packages
    FOR INSERT WITH CHECK (is_admin((select auth.uid())::uuid));

CREATE POLICY "packages_update" ON public.credit_packages
    FOR UPDATE USING (is_admin((select auth.uid())::uuid));

CREATE POLICY "packages_delete" ON public.credit_packages
    FOR DELETE USING (is_super_admin((select auth.uid())::uuid));

-- ============================================================
-- TABLE: admin_audit_logs
-- ============================================================
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.admin_audit_logs;

CREATE POLICY "admin_audit_select" ON public.admin_audit_logs
    FOR SELECT USING (is_admin((select auth.uid())::uuid));

-- ============================================================
-- TABLE: credit_transactions
-- ============================================================
DROP POLICY IF EXISTS "Users view own or admins view all credit transactions" ON public.credit_transactions;

CREATE POLICY "credit_transactions_select" ON public.credit_transactions
    FOR SELECT USING (
        user_id::text = (select auth.uid())::text
        OR is_admin((select auth.uid())::uuid)
    );

-- webhook_events already uses service_role only — no changes needed

COMMIT;
