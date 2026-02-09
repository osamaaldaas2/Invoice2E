-- Migration 023: Clean up duplicate/unused indexes + add voucher RLS policies
-- Fixes:
--   1. Duplicate index on webhook_events (idx_webhook_events_event_provider duplicates constraint unique_webhook_event)
--   2. Drop unused indexes (reported by Supabase linter — never queried)
--   3. Add RLS policies for vouchers and voucher_redemptions (RLS enabled but no policies)

BEGIN;

-- ============================================================
-- 1. DROP DUPLICATE INDEX on webhook_events
--    The table already has CONSTRAINT unique_webhook_event UNIQUE (event_id, provider)
--    which implicitly creates an index. Migration 020 added a second identical one.
-- ============================================================
DROP INDEX IF EXISTS idx_webhook_events_event_provider;

-- ============================================================
-- 2. DROP UNUSED INDEXES (Supabase linter: never used)
--    These are safe to drop — if a query ever needs them, they can be recreated.
-- ============================================================

-- webhook_events: individual column indexes are redundant with the composite unique constraint
DROP INDEX IF EXISTS idx_webhook_events_event_id;
DROP INDEX IF EXISTS idx_webhook_events_provider;
DROP INDEX IF EXISTS idx_webhook_events_processed_at;

-- payment_transactions: lookup indexes never used (payments are found by user_id or session checks)
DROP INDEX IF EXISTS idx_payment_transactions_stripe_id;
DROP INDEX IF EXISTS idx_payment_transactions_paypal_id;
DROP INDEX IF EXISTS idx_payment_transactions_stripe_session_id;

-- audit_logs: created_at index never used
DROP INDEX IF EXISTS idx_audit_logs_created_at;

-- users: role and is_banned indexes never used (small table, seq scan is fine)
DROP INDEX IF EXISTS idx_users_role;
DROP INDEX IF EXISTS idx_users_is_banned;

-- user_templates: user_id index never used (RLS already filters by user_id)
DROP INDEX IF EXISTS idx_user_templates_user_id;

-- credit_packages: slug index never used
DROP INDEX IF EXISTS idx_credit_packages_slug;

-- admin_audit_logs: action and resource indexes never used
DROP INDEX IF EXISTS idx_admin_audit_action;
DROP INDEX IF EXISTS idx_admin_audit_resource;

-- voucher_redemptions: individual column indexes redundant with composite idx_voucher_redemptions_user_voucher
DROP INDEX IF EXISTS idx_voucher_redemptions_voucher;
DROP INDEX IF EXISTS idx_voucher_redemptions_user;

-- vouchers: low-traffic table, these indexes add write overhead with no read benefit
DROP INDEX IF EXISTS idx_vouchers_active;
DROP INDEX IF EXISTS idx_vouchers_valid_until;

-- ============================================================
-- 3. ADD RLS POLICIES for vouchers and voucher_redemptions
--    Both tables have RLS enabled but no policies defined.
--    The redeem_voucher() function uses SECURITY DEFINER so it bypasses RLS,
--    but we still need policies for admin management and user reads.
-- ============================================================

-- vouchers: admins can CRUD, all authenticated users can read active vouchers
CREATE POLICY "vouchers_select" ON public.vouchers
    FOR SELECT USING (
        is_active = TRUE
        OR is_admin((select auth.uid())::uuid)
    );

CREATE POLICY "vouchers_insert" ON public.vouchers
    FOR INSERT WITH CHECK (is_admin((select auth.uid())::uuid));

CREATE POLICY "vouchers_update" ON public.vouchers
    FOR UPDATE USING (is_admin((select auth.uid())::uuid));

CREATE POLICY "vouchers_delete" ON public.vouchers
    FOR DELETE USING (is_super_admin((select auth.uid())::uuid));

-- voucher_redemptions: users can see their own redemptions, admins can see all
CREATE POLICY "voucher_redemptions_select" ON public.voucher_redemptions
    FOR SELECT USING (
        user_id::text = (select auth.uid())::text
        OR is_admin((select auth.uid())::uuid)
    );

COMMIT;
