-- Migration 035: Clean up duplicate extraction_data fields (LOW)
-- Problem: 17 records have both 'items' and 'line_items' keys in JSONB.
-- Fix: Remove the 'items' key where 'line_items' already exists.
-- For records with 'items' but no 'line_items', rename 'items' to 'line_items'.

-- Case 1: Both keys exist — remove 'items' (line_items is canonical)
UPDATE invoice_extractions
SET extraction_data = extraction_data - 'items'
WHERE extraction_data ? 'items'
AND extraction_data ? 'line_items';

-- Case 2: Only 'items' exists — rename to 'line_items'
UPDATE invoice_extractions
SET extraction_data = (extraction_data - 'items') || jsonb_build_object('line_items', extraction_data->'items')
WHERE extraction_data ? 'items'
AND NOT (extraction_data ? 'line_items');
