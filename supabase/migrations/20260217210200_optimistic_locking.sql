-- Add optimistic locking (row_version) to invoice tables

ALTER TABLE invoice_extractions ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE invoice_conversions ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION increment_row_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.row_version = OLD.row_version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_increment_row_version_extractions ON invoice_extractions;
CREATE TRIGGER trg_increment_row_version_extractions
  BEFORE UPDATE ON invoice_extractions
  FOR EACH ROW EXECUTE FUNCTION increment_row_version();

DROP TRIGGER IF EXISTS trg_increment_row_version_conversions ON invoice_conversions;
CREATE TRIGGER trg_increment_row_version_conversions
  BEFORE UPDATE ON invoice_conversions
  FOR EACH ROW EXECUTE FUNCTION increment_row_version();

CREATE OR REPLACE FUNCTION check_optimistic_lock(
  p_table_name TEXT, p_row_id UUID, p_expected_version INTEGER
) RETURNS BOOLEAN AS $$
DECLARE current_version INTEGER;
BEGIN
  IF p_table_name = 'invoice_extractions' THEN
    SELECT row_version INTO current_version FROM invoice_extractions WHERE id = p_row_id;
  ELSIF p_table_name = 'invoice_conversions' THEN
    SELECT row_version INTO current_version FROM invoice_conversions WHERE id = p_row_id;
  ELSE
    RAISE EXCEPTION 'Unsupported table: %', p_table_name;
  END IF;
  IF current_version IS NULL THEN
    RAISE EXCEPTION 'Row not found: % / %', p_table_name, p_row_id;
  END IF;
  RETURN current_version = p_expected_version;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE INDEX IF NOT EXISTS idx_invoice_extractions_row_version ON invoice_extractions(id, row_version);
CREATE INDEX IF NOT EXISTS idx_invoice_conversions_row_version ON invoice_conversions(id, row_version);
