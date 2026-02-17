-- Add envelope encryption columns to invoice_extractions table

ALTER TABLE invoice_extractions
  ADD COLUMN IF NOT EXISTS encryption_key_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS encrypted_fields  JSONB DEFAULT NULL;

COMMENT ON COLUMN invoice_extractions.encryption_key_id IS 'Identifier of the wrapped DEK bundle used to encrypt sensitive fields';
COMMENT ON COLUMN invoice_extractions.encrypted_fields  IS 'JSON array of dot-notation field paths that are currently encrypted';

CREATE INDEX IF NOT EXISTS idx_invoice_extractions_encryption_key_id
  ON invoice_extractions (encryption_key_id)
  WHERE encryption_key_id IS NOT NULL;
