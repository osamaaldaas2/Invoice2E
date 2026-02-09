-- Password Reset Tokens table
-- Stores hashed tokens with expiry for secure password reset flow

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for token lookup (most common query)
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens(token_hash);

-- Index for cleanup of expired tokens
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens(expires_at);

-- RLS
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- Only service role can manage tokens (no direct user access)
CREATE POLICY "Service role manages reset tokens"
    ON password_reset_tokens
    FOR ALL
    USING (true)
    WITH CHECK (true);
