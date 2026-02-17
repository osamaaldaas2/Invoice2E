-- Add per-extraction output_format column to invoice_extractions.
-- This is the authoritative source of truth for what format each extraction targets.

ALTER TABLE invoice_extractions
  ADD COLUMN IF NOT EXISTS output_format VARCHAR(50);

-- Backfill from existing conversion records where available
UPDATE invoice_extractions e
SET output_format = c.output_format
FROM invoice_conversions c
WHERE c.extraction_id = e.id
  AND c.output_format IS NOT NULL
  AND e.output_format IS NULL;

-- Index for filtering/grouping by format
CREATE INDEX IF NOT EXISTS idx_extractions_output_format
  ON invoice_extractions(output_format) WHERE output_format IS NOT NULL;
