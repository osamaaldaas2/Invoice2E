-- FIX: Audit V2 [F-025] — Add basic JSONB structure check for extraction data.
-- Ensures minimum required fields are present when extraction_data is non-null.
-- Full schema validation happens in the application layer (Zod).
ALTER TABLE invoice_extractions
ADD CONSTRAINT check_extraction_data_structure
CHECK (
  extraction_data IS NULL
  OR (
    extraction_data ? 'invoiceNumber'
    AND extraction_data ? 'issueDate'
    AND extraction_data ? 'totalAmount'
  )
);

-- Reconciliation check (run manually to verify existing data):
-- SELECT id, extraction_data
-- FROM invoice_extractions
-- WHERE extraction_data IS NOT NULL
--   AND NOT (
--     extraction_data ? 'invoiceNumber'
--     AND extraction_data ? 'issueDate'
--     AND extraction_data ? 'totalAmount'
--   );
