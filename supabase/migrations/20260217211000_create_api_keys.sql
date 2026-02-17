-- API keys for B2B programmatic access. Raw keys never stored.

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  prefix VARCHAR(20) NOT NULL DEFAULT 'einv_live_',
  hashed_key VARCHAR(64) NOT NULL UNIQUE,
  key_hint VARCHAR(4) NOT NULL,
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  CONSTRAINT scopes_is_array CHECK (jsonb_typeof(scopes) = 'array'),
  CONSTRAINT name_not_empty CHECK (char_length(trim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hashed_key ON api_keys (hashed_key);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys (user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_active ON api_keys (user_id) WHERE revoked_at IS NULL;

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS api_keys_select_own ON api_keys;
CREATE POLICY api_keys_select_own ON api_keys FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS api_keys_insert_own ON api_keys;
CREATE POLICY api_keys_insert_own ON api_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS api_keys_update_own ON api_keys;
CREATE POLICY api_keys_update_own ON api_keys FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS api_keys_service_all ON api_keys;
CREATE POLICY api_keys_service_all ON api_keys FOR ALL USING (auth.role() = 'service_role');
