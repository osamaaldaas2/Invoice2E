-- FIX: Audit #054 — seed feature flags (all disabled by default)

-- Ensure unique constraint on name exists (table PK is id, not name)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feature_flags_name_key'
  ) THEN
    ALTER TABLE feature_flags ADD CONSTRAINT feature_flags_name_key UNIQUE (name);
  END IF;
END $$;

INSERT INTO feature_flags (id, name, enabled, description) VALUES
  ('use_state_machine',    'USE_STATE_MACHINE',    false, 'Enforce XState state machine transitions'),
  ('use_circuit_breaker',  'USE_CIRCUIT_BREAKER',  false, 'Enable circuit breaker on AI provider calls'),
  ('use_file_quarantine',  'USE_FILE_QUARANTINE',  false, 'Enable file quarantine before processing'),
  ('use_granular_rbac',    'USE_GRANULAR_RBAC',    false, 'Use CASL permission checks instead of role checks'),
  ('use_field_encryption', 'USE_FIELD_ENCRYPTION', false, 'Enable envelope encryption on sensitive fields'),
  ('use_outbox',           'USE_OUTBOX',           false, 'Enable transactional outbox for domain events'),
  ('use_di_container',     'USE_DI_CONTAINER',     false, 'Use Awilix DI container for service resolution')
ON CONFLICT (name) DO NOTHING;
