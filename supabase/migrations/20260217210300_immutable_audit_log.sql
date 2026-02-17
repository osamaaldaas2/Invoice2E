-- Make audit_logs immutable with hash chaining

CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS prev_hash TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entry_hash TEXT;

-- Backfill entry_hash for existing rows
UPDATE audit_logs
SET entry_hash = encode(
  sha256(
    (COALESCE(action, '') || '|' || COALESCE(resource_type, '') || '|' ||
    COALESCE(resource_id, '') || '|' || COALESCE(user_id::text, '') || '|' ||
    COALESCE(changes::text, '') || '|' || COALESCE(created_at::text, ''))::bytea), 'hex')
WHERE entry_hash IS NULL;

-- Backfill prev_hash chain
WITH ordered AS (
  SELECT id, LAG(entry_hash) OVER (ORDER BY created_at, id) AS prev FROM audit_logs
)
UPDATE audit_logs SET prev_hash = ordered.prev
FROM ordered WHERE audit_logs.id = ordered.id AND audit_logs.prev_hash IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM audit_logs WHERE entry_hash IS NULL) THEN
    ALTER TABLE audit_logs ALTER COLUMN entry_hash SET NOT NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION audit_log_hash_chain()
RETURNS TRIGGER AS $$
DECLARE last_hash TEXT;
BEGIN
  SELECT entry_hash INTO last_hash FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT 1;
  NEW.prev_hash := last_hash;
  NEW.entry_hash := encode(
    sha256(
      (COALESCE(NEW.action, '') || '|' || COALESCE(NEW.resource_type, '') || '|' ||
      COALESCE(NEW.resource_id, '') || '|' || COALESCE(NEW.user_id::text, '') || '|' ||
      COALESCE(NEW.changes::text, '') || '|' || COALESCE(NEW.created_at::text, ''))::bytea), 'hex');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_log_hash_chain ON audit_logs;
CREATE TRIGGER trg_audit_log_hash_chain
  BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION audit_log_hash_chain();

CREATE OR REPLACE FUNCTION verify_audit_chain(p_limit INT DEFAULT 1000)
RETURNS TABLE (total_checked BIGINT, is_valid BOOLEAN, first_broken_id UUID,
  first_broken_expected_hash TEXT, first_broken_actual_prev_hash TEXT) AS $$
DECLARE rec RECORD; prev_rec RECORD; checked BIGINT := 0;
  broken_id UUID; expected_hash TEXT; actual_prev TEXT; chain_valid BOOLEAN := TRUE;
BEGIN
  prev_rec := NULL;
  FOR rec IN SELECT a.id, a.action, a.resource_type, a.resource_id, a.user_id, a.changes,
    a.created_at, a.entry_hash, a.prev_hash FROM audit_logs a ORDER BY a.created_at ASC, a.id ASC LIMIT p_limit
  LOOP
    checked := checked + 1;
    expected_hash := encode(sha256(
      (COALESCE(rec.action, '') || '|' || COALESCE(rec.resource_type, '') || '|' ||
      COALESCE(rec.resource_id, '') || '|' || COALESCE(rec.user_id::text, '') || '|' ||
      COALESCE(rec.changes::text, '') || '|' || COALESCE(rec.created_at::text, ''))::bytea), 'hex');
    IF rec.entry_hash != expected_hash THEN chain_valid := FALSE; broken_id := rec.id; actual_prev := rec.entry_hash; EXIT; END IF;
    IF prev_rec IS NOT NULL AND rec.prev_hash IS DISTINCT FROM prev_rec.entry_hash THEN
      chain_valid := FALSE; broken_id := rec.id; expected_hash := prev_rec.entry_hash; actual_prev := rec.prev_hash; EXIT;
    END IF;
    prev_rec := rec;
  END LOOP;
  RETURN QUERY SELECT checked, chain_valid, broken_id, expected_hash, actual_prev;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE INDEX IF NOT EXISTS idx_audit_logs_entry_hash ON audit_logs(entry_hash);

REVOKE DELETE ON audit_logs FROM authenticated;
REVOKE UPDATE ON audit_logs FROM authenticated;
DROP POLICY IF EXISTS "Users can update audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Users can delete audit logs" ON audit_logs;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_logs' AND policyname = 'Users can insert audit logs') THEN
    CREATE POLICY "Users can insert audit logs" ON audit_logs FOR INSERT WITH CHECK (true);
  END IF;
END $$;
