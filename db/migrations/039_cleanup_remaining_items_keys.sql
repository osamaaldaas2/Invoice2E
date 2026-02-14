-- Migration 039: Clean remaining duplicate 'items' keys in extraction_data
-- 3 records still have both 'items' and 'line_items'; remove the redundant 'items' key

UPDATE invoice_extractions
SET extraction_data = extraction_data - 'items'
WHERE extraction_data ? 'items'
  AND extraction_data ? 'line_items';
