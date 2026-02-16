-- Stage 6: Add output_format column to invoice_conversions
-- Maps to the new 9-format OutputFormat system (e.g. 'xrechnung-cii', 'xrechnung-ubl', 'zugferd-comfort', etc.)
-- Keeps legacy conversion_format column for backward compatibility.

ALTER TABLE invoice_conversions ADD COLUMN IF NOT EXISTS output_format VARCHAR(50);

-- Backfill existing records based on legacy conversion_format values
UPDATE invoice_conversions SET output_format = 'xrechnung-cii'
  WHERE output_format IS NULL AND (conversion_format = 'XRechnung' OR conversion_format = 'CII');

UPDATE invoice_conversions SET output_format = 'xrechnung-ubl'
  WHERE output_format IS NULL AND conversion_format = 'UBL';

-- Add output_format column to batch_jobs for per-batch format selection
ALTER TABLE batch_jobs ADD COLUMN IF NOT EXISTS output_format VARCHAR(50) DEFAULT 'xrechnung-cii';
