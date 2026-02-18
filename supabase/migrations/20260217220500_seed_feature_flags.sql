-- FIX: Audit #054 — seed feature flags (all disabled by default)

-- Ensure unique constraint on name exists (table PK is id, not name)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feature_flags_name_key'
  ) THEN
    ALTER TABLE feature_flags ADD CONSTRAINT feature_flags_name_key UNIQUE (name);
  END IF;
END $$;

INSERT INTO feature_flags (name, enabled, description) VALUES
  ('USE_STATE_MACHINE', false, 'Enforce XState state machine transitions'),
  ('USE_CIRCUIT_BREAKER', false, 'Enable circuit breaker on AI provider calls'),
  ('USE_FILE_QUARANTINE', false, 'Enable file quarantine before processing'),
  ('USE_GRANULAR_RBAC', false, 'Use CASL permission checks instead of role checks'),
  ('USE_FIELD_ENCRYPTION', false, 'Enable envelope encryption on sensitive fields'),
  ('USE_OUTBOX', false, 'Enable transactional outbox for domain events'),
  ('USE_DI_CONTAINER', false, 'Use Awilix DI container for service resolution')
ON CONFLICT (name) DO NOTHING;
