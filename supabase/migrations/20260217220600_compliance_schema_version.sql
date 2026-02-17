-- FIX: Audit #029 — expand conversion_format from VARCHAR(10) to VARCHAR(50)
-- FIX: Compliance — store schema/schematron versions per conversion
DO $$
BEGIN
  -- Widen conversion_format if it's too narrow
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_conversions' AND column_name = 'conversion_format'
      AND character_maximum_length IS NOT NULL AND character_maximum_length < 50
  ) THEN
    ALTER TABLE invoice_conversions ALTER COLUMN conversion_format TYPE VARCHAR(50);
  END IF;

  -- Add schema_version column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_conversions' AND column_name = 'schema_version'
  ) THEN
    ALTER TABLE invoice_conversions ADD COLUMN schema_version TEXT;
  END IF;

  -- Add schematron_version column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_conversions' AND column_name = 'schematron_version'
  ) THEN
    ALTER TABLE invoice_conversions ADD COLUMN schematron_version TEXT;
  END IF;
END $$;
