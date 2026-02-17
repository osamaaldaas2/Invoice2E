-- Idempotency Keys table

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  idempotency_key VARCHAR(255) NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_path VARCHAR(512) NOT NULL,
  response_status INT NOT NULL,
  response_body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  CONSTRAINT uq_idempotency_key_user UNIQUE (idempotency_key, user_id)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_key_user ON idempotency_keys (idempotency_key, user_id);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires_at ON idempotency_keys (expires_at);
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own idempotency keys" ON idempotency_keys;
CREATE POLICY "Users can view own idempotency keys" ON idempotency_keys FOR SELECT USING (user_id::text = auth.uid()::text);
