-- FIX: Audit #004 — FORCE ROW LEVEL SECURITY on all tenant-scoped tables
-- After this, even the table owner (service_role) must pass through RLS policies.
-- SECURITY DEFINER functions bypass RLS by design and are unaffected.

-- Step 1: Add service_role bypass policies for tables that need admin access.
-- These allow service_role to perform all operations (used by auth, admin, webhooks, batch jobs).

-- users: auth service (signup, login, admin management)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_users' AND tablename = 'users') THEN
    CREATE POLICY "service_role_all_users" ON users FOR ALL
      USING (current_setting('role', true) = 'service_role')
      WITH CHECK (current_setting('role', true) = 'service_role');
  END IF;
END $$;

-- user_credits: credit operations via RPCs + admin adjustments
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_user_credits' AND tablename = 'user_credits') THEN
    CREATE POLICY "service_role_all_user_credits" ON user_credits FOR ALL
      USING (current_setting('role', true) = 'service_role')
      WITH CHECK (current_setting('role', true) = 'service_role');
  END IF;
END $$;

-- invoice_extractions: batch processing needs admin access
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_extractions' AND tablename = 'invoice_extractions') THEN
    CREATE POLICY "service_role_all_extractions" ON invoice_extractions FOR ALL
      USING (current_setting('role', true) = 'service_role')
      WITH CHECK (current_setting('role', true) = 'service_role');
  END IF;
END $$;

-- invoice_conversions: batch processing + admin
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_conversions' AND tablename = 'invoice_conversions') THEN
    CREATE POLICY "service_role_all_conversions" ON invoice_conversions FOR ALL
      USING (current_setting('role', true) = 'service_role')
      WITH CHECK (current_setting('role', true) = 'service_role');
  END IF;
END $$;

-- payment_transactions: webhook processing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_payments' AND tablename = 'payment_transactions') THEN
    CREATE POLICY "service_role_all_payments" ON payment_transactions FOR ALL
      USING (current_setting('role', true) = 'service_role')
      WITH CHECK (current_setting('role', true) = 'service_role');
  END IF;
END $$;

-- audit_logs: system writes audit logs via service role
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_audit_logs' AND tablename = 'audit_logs') THEN
    CREATE POLICY "service_role_all_audit_logs" ON audit_logs FOR ALL
      USING (current_setting('role', true) = 'service_role')
      WITH CHECK (current_setting('role', true) = 'service_role');
  END IF;
END $$;

-- api_keys: key management via service role
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_api_keys' AND tablename = 'api_keys') THEN
    CREATE POLICY "service_role_all_api_keys" ON api_keys FOR ALL
      USING (current_setting('role', true) = 'service_role')
      WITH CHECK (current_setting('role', true) = 'service_role');
  END IF;
END $$;

-- Tables that already have service_role policies from migration 20260217211400:
-- quarantine_files, saga_executions, saga_log, feature_flags, outbox_events, idempotency_keys
-- These are already covered.

-- Additional tables that may need service_role access:
-- credit_transactions (if table exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'credit_transactions') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_credit_txns' AND tablename = 'credit_transactions') THEN
      EXECUTE 'CREATE POLICY "service_role_all_credit_txns" ON credit_transactions FOR ALL
        USING (current_setting(''role'', true) = ''service_role'')
        WITH CHECK (current_setting(''role'', true) = ''service_role'')';
    END IF;
  END IF;
END $$;

-- batch_jobs (if table exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'batch_jobs') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_batch_jobs' AND tablename = 'batch_jobs') THEN
      EXECUTE 'CREATE POLICY "service_role_all_batch_jobs" ON batch_jobs FOR ALL
        USING (current_setting(''role'', true) = ''service_role'')
        WITH CHECK (current_setting(''role'', true) = ''service_role'')';
    END IF;
  END IF;
END $$;

-- webhook_events (if table exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'webhook_events') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_webhook_events' AND tablename = 'webhook_events') THEN
      EXECUTE 'CREATE POLICY "service_role_all_webhook_events" ON webhook_events FOR ALL
        USING (current_setting(''role'', true) = ''service_role'')
        WITH CHECK (current_setting(''role'', true) = ''service_role'')';
    END IF;
  END IF;
END $$;

-- vouchers (if table exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vouchers') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_vouchers' AND tablename = 'vouchers') THEN
      EXECUTE 'CREATE POLICY "service_role_all_vouchers" ON vouchers FOR ALL
        USING (current_setting(''role'', true) = ''service_role'')
        WITH CHECK (current_setting(''role'', true) = ''service_role'')';
    END IF;
  END IF;
END $$;

-- password_reset_tokens (auth service)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'password_reset_tokens') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_pwd_tokens' AND tablename = 'password_reset_tokens') THEN
      EXECUTE 'CREATE POLICY "service_role_all_pwd_tokens" ON password_reset_tokens FOR ALL
        USING (current_setting(''role'', true) = ''service_role'')
        WITH CHECK (current_setting(''role'', true) = ''service_role'')';
    END IF;
  END IF;
END $$;

-- credit_packages (public listing + admin management)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'credit_packages') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_packages' AND tablename = 'credit_packages') THEN
      EXECUTE 'CREATE POLICY "service_role_all_packages" ON credit_packages FOR ALL
        USING (current_setting(''role'', true) = ''service_role'')
        WITH CHECK (current_setting(''role'', true) = ''service_role'')';
    END IF;
  END IF;
END $$;

-- user_templates (template management)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_templates') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_templates' AND tablename = 'user_templates') THEN
      EXECUTE 'CREATE POLICY "service_role_all_templates" ON user_templates FOR ALL
        USING (current_setting(''role'', true) = ''service_role'')
        WITH CHECK (current_setting(''role'', true) = ''service_role'')';
    END IF;
  END IF;
END $$;

-- retention_policies, retention_log, gdpr_requests (already have service_role policies)
-- No action needed.

-- Step 2: FORCE ROW LEVEL SECURITY on all tables
-- After this, service_role must pass through the policies created above.
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE user_credits FORCE ROW LEVEL SECURITY;
ALTER TABLE invoice_extractions FORCE ROW LEVEL SECURITY;
ALTER TABLE invoice_conversions FORCE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

-- Only FORCE on tables that exist
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'api_keys' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE api_keys FORCE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'quarantine_files' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE quarantine_files FORCE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'saga_executions' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE saga_executions FORCE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'feature_flags' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE feature_flags FORCE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'outbox_events' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'idempotency_keys' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE idempotency_keys FORCE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'credit_transactions' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE credit_transactions FORCE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'batch_jobs' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE batch_jobs FORCE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'webhook_events' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE webhook_events FORCE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vouchers' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE vouchers FORCE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'password_reset_tokens' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE password_reset_tokens FORCE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'credit_packages' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE credit_packages FORCE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_templates' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE user_templates FORCE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'retention_policies' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE retention_policies FORCE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'retention_log' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE retention_log FORCE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'gdpr_requests' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE gdpr_requests FORCE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'saga_log' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE saga_log FORCE ROW LEVEL SECURITY';
  END IF;
END $$;
