-- Feature flags for safe rollouts

CREATE TABLE IF NOT EXISTS feature_flags (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  enabled     BOOLEAN NOT NULL DEFAULT false,
  rules       JSONB DEFAULT NULL,
  percentage  SMALLINT DEFAULT NULL CHECK (percentage >= 0 AND percentage <= 100),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_enabled ON feature_flags (enabled);

CREATE OR REPLACE FUNCTION update_feature_flags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_feature_flags_updated_at
    BEFORE UPDATE ON feature_flags
    FOR EACH ROW EXECUTE FUNCTION update_feature_flags_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO feature_flags (id, name, description) VALUES
  ('peppol_v2_engine',      'Peppol V2 Engine',       'Peppol v2 format engine rollout'),
  ('batch_processing_v2',   'Batch Processing V2',    'Batch processing v2 pipeline'),
  ('envelope_encryption',   'Envelope Encryption',    'Envelope-level encryption for stored invoices'),
  ('new_extraction_model',  'New Extraction Model',   'New AI extraction model rollout'),
  ('enhanced_validation',   'Enhanced Validation',    'Enhanced validation rule set')
ON CONFLICT (id) DO NOTHING;
