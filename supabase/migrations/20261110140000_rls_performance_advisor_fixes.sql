-- Resolve Supabase performance advisor warnings without changing access semantics.
--
-- 0003 auth_rls_initplan:
--   auth.uid()/auth.role()/auth.jwt()/current_setting() in policies were evaluated per row.
--   Wrapped in (select ...) so Postgres evaluates them once per statement.
-- 0006 multiple_permissive_policies:
--   Service-role policies were defined for PUBLIC and checked the role per row, so every
--   role (anon, authenticated, ...) evaluated them in addition to its own policies.
--   They are now scoped TO service_role with a constant predicate (identical effect).
-- 0009 duplicate_index:
--   api_keys.hashed_key had a UNIQUE constraint index plus an identical plain index.

-- ---------------------------------------------------------------------------
-- 1. Service-role policies: scope to the role instead of checking it per row
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT * FROM (VALUES
      ('users',                 'service_role_all_users'),
      ('user_credits',          'service_role_all_user_credits'),
      ('invoice_extractions',   'service_role_all_extractions'),
      ('invoice_conversions',   'service_role_all_conversions'),
      ('payment_transactions',  'service_role_all_payments'),
      ('audit_logs',            'service_role_all_audit_logs'),
      ('api_keys',              'service_role_all_api_keys'),
      ('credit_transactions',   'service_role_all_credit_txns'),
      ('batch_jobs',            'service_role_all_batch_jobs'),
      ('webhook_events',        'service_role_all_webhook_events'),
      ('vouchers',              'service_role_all_vouchers'),
      ('password_reset_tokens', 'service_role_all_pwd_tokens'),
      ('credit_packages',       'service_role_all_packages'),
      ('user_templates',        'service_role_all_templates'),
      ('quarantine_files',      'Service role manages quarantine files'),
      ('saga_executions',       'Service role manages saga executions'),
      ('saga_log',              'Service role manages saga log'),
      ('feature_flags',         'Service role manages feature flags'),
      ('outbox_events',         'Service role manages outbox events'),
      ('idempotency_keys',      'Service role manages idempotency keys'),
      ('retention_policies',    'Service role full access to retention_policies'),
      ('retention_log',         'Service role full access to retention_log')
    ) AS t(tbl, pol)
  LOOP
    IF to_regclass(format('public.%I', p.tbl)) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.pol, p.tbl);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        p.pol, p.tbl
      );
    END IF;
  END LOOP;
END $$;

-- api_keys had two identical service-role policies; keep service_role_all_api_keys.
DROP POLICY IF EXISTS api_keys_service_all ON public.api_keys;

-- ---------------------------------------------------------------------------
-- 2. Per-user policies: evaluate auth functions once per statement
-- ---------------------------------------------------------------------------

-- api_keys
DROP POLICY IF EXISTS api_keys_select_own ON public.api_keys;
CREATE POLICY api_keys_select_own ON public.api_keys FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS api_keys_insert_own ON public.api_keys;
CREATE POLICY api_keys_insert_own ON public.api_keys FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS api_keys_update_own ON public.api_keys;
CREATE POLICY api_keys_update_own ON public.api_keys FOR UPDATE
  USING ((select auth.uid()) = user_id);

-- invoices
DROP POLICY IF EXISTS invoices_select_own ON public.invoices;
CREATE POLICY invoices_select_own ON public.invoices FOR SELECT
  USING ((select auth.uid()) = user_id);

-- quarantine_files
DROP POLICY IF EXISTS "Users can view own quarantine files" ON public.quarantine_files;
CREATE POLICY "Users can view own quarantine files" ON public.quarantine_files FOR SELECT
  USING (uploaded_by::text = (select auth.uid())::text);

DROP POLICY IF EXISTS "Users can insert quarantine files" ON public.quarantine_files;
CREATE POLICY "Users can insert quarantine files" ON public.quarantine_files FOR INSERT
  WITH CHECK (uploaded_by::text = (select auth.uid())::text);

-- idempotency_keys
DROP POLICY IF EXISTS "Users can view own idempotency keys" ON public.idempotency_keys;
CREATE POLICY "Users can view own idempotency keys" ON public.idempotency_keys FOR SELECT
  USING (user_id::text = (select auth.uid())::text);

-- feature_flags: previously USING (auth.role() IN ('authenticated','service_role'));
-- service_role is covered by its own policy above.
DROP POLICY IF EXISTS "Authenticated users can read feature flags" ON public.feature_flags;
CREATE POLICY "Authenticated users can read feature flags" ON public.feature_flags
  FOR SELECT TO authenticated USING (true);

-- gdpr_requests (insert keeps the restrictions from 20261103135202)
DROP POLICY IF EXISTS gdpr_requests_select ON public.gdpr_requests;
CREATE POLICY gdpr_requests_select ON public.gdpr_requests FOR SELECT
  USING (
    (select auth.uid()) = subject_id
    OR (select auth.jwt() ->> 'role') IN ('admin', 'super_admin')
  );

DROP POLICY IF EXISTS gdpr_requests_insert ON public.gdpr_requests;
CREATE POLICY gdpr_requests_insert ON public.gdpr_requests FOR INSERT TO authenticated
  WITH CHECK (
    subject_id = (select auth.uid()) AND status = 'pending' AND processed_by IS NULL
    AND completed_at IS NULL AND notes IS NULL
  );

DROP POLICY IF EXISTS gdpr_requests_update ON public.gdpr_requests;
CREATE POLICY gdpr_requests_update ON public.gdpr_requests FOR UPDATE
  USING ((select auth.jwt() ->> 'role') IN ('admin', 'super_admin'));

-- ---------------------------------------------------------------------------
-- 3. Duplicate index (the UNIQUE constraint index api_keys_hashed_key_key remains)
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_api_keys_hashed_key;
