-- Seed S3 wire-in feature flags not yet in DB
INSERT INTO feature_flags (id, name, enabled, description) VALUES
  ('use_audit_hash_verify', 'USE_AUDIT_HASH_VERIFY', false, 'Verify audit log hash chain on read'),
  ('use_data_retention',    'USE_DATA_RETENTION',    false, 'Enable automated data retention engine'),
  ('use_gdpr_endpoints',    'USE_GDPR_ENDPOINTS',    false, 'Enable GDPR data export and deletion endpoints')
ON CONFLICT (name) DO NOTHING;
