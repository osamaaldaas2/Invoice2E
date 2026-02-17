-- Fix RLS gaps on new tables from the hardening project.

-- 1. quarantine_files: users can view own uploads, service_role manages lifecycle
DROP POLICY IF EXISTS "Users can view own quarantine files" ON quarantine_files;
CREATE POLICY "Users can view own quarantine files" ON quarantine_files
  FOR SELECT USING (uploaded_by::text = auth.uid()::text);

DROP POLICY IF EXISTS "Users can insert quarantine files" ON quarantine_files;
CREATE POLICY "Users can insert quarantine files" ON quarantine_files
  FOR INSERT WITH CHECK (uploaded_by::text = auth.uid()::text);

DROP POLICY IF EXISTS "Service role manages quarantine files" ON quarantine_files;
CREATE POLICY "Service role manages quarantine files" ON quarantine_files
  FOR ALL USING (auth.role() = 'service_role');

-- 2. saga_executions: enable RLS, service_role only (internal infrastructure)
ALTER TABLE saga_executions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages saga executions" ON saga_executions;
CREATE POLICY "Service role manages saga executions" ON saga_executions
  FOR ALL USING (auth.role() = 'service_role');

-- 3. saga_log: enable RLS, service_role only
ALTER TABLE saga_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages saga log" ON saga_log;
CREATE POLICY "Service role manages saga log" ON saga_log
  FOR ALL USING (auth.role() = 'service_role');

-- 4. feature_flags: enable RLS, readable by all authenticated, writable by admins
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can read feature flags" ON feature_flags;
CREATE POLICY "Authenticated users can read feature flags" ON feature_flags
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role manages feature flags" ON feature_flags;
CREATE POLICY "Service role manages feature flags" ON feature_flags
  FOR ALL USING (auth.role() = 'service_role');

-- 5. outbox_events: service_role only (internal infrastructure)
DROP POLICY IF EXISTS "Service role manages outbox events" ON outbox_events;
CREATE POLICY "Service role manages outbox events" ON outbox_events
  FOR ALL USING (auth.role() = 'service_role');

-- 6. idempotency_keys: add INSERT policy for service_role operations
DROP POLICY IF EXISTS "Service role manages idempotency keys" ON idempotency_keys;
CREATE POLICY "Service role manages idempotency keys" ON idempotency_keys
  FOR ALL USING (auth.role() = 'service_role');
