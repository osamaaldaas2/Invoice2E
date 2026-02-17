-- Per-jurisdiction data retention policies + audit trail

CREATE TABLE IF NOT EXISTS retention_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  jurisdiction VARCHAR(10) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  retention_days INT NOT NULL CHECK (retention_days >= 0),
  legal_basis VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (jurisdiction, entity_type)
);

CREATE TABLE IF NOT EXISTS retention_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(255) NOT NULL,
  action VARCHAR(20) NOT NULL CHECK (action IN ('archive', 'anonymize', 'delete')),
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed')),
  error_message TEXT,
  executed_by VARCHAR(255) NOT NULL,
  executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_retention_policies_jurisdiction ON retention_policies(jurisdiction);
CREATE INDEX IF NOT EXISTS idx_retention_policies_entity_type ON retention_policies(entity_type);
CREATE INDEX IF NOT EXISTS idx_retention_policies_active ON retention_policies(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_retention_log_policy_id ON retention_log(policy_id);
CREATE INDEX IF NOT EXISTS idx_retention_log_entity_type ON retention_log(entity_type);
CREATE INDEX IF NOT EXISTS idx_retention_log_entity_id ON retention_log(entity_id);
CREATE INDEX IF NOT EXISTS idx_retention_log_executed_at ON retention_log(executed_at);
CREATE INDEX IF NOT EXISTS idx_retention_log_action ON retention_log(action);

ALTER TABLE retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to retention_policies" ON retention_policies;
CREATE POLICY "Service role full access to retention_policies" ON retention_policies FOR ALL USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Service role full access to retention_log" ON retention_log;
CREATE POLICY "Service role full access to retention_log" ON retention_log FOR ALL USING (auth.role() = 'service_role');
