-- FIX: Audit #054 — seed feature flags (all disabled by default)
INSERT INTO feature_flags (name, enabled, description) VALUES
  ('USE_STATE_MACHINE', false, 'Enforce XState state machine transitions'),
  ('USE_CIRCUIT_BREAKER', false, 'Enable circuit breaker on AI provider calls'),
  ('USE_FILE_QUARANTINE', false, 'Enable file quarantine before processing'),
  ('USE_GRANULAR_RBAC', false, 'Use CASL permission checks instead of role checks'),
  ('USE_FIELD_ENCRYPTION', false, 'Enable envelope encryption on sensitive fields'),
  ('USE_OUTBOX', false, 'Enable transactional outbox for domain events'),
  ('USE_DI_CONTAINER', false, 'Use Awilix DI container for service resolution')
ON CONFLICT (name) DO NOTHING;
