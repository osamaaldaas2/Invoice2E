-- Migration 036: Backfill gemini_response_time_ms from JSONB (LOW)
-- Problem: 1,743/1,757 rows have NULL gemini_response_time_ms but the data
-- exists in extraction_data->>'processing_time_ms'.
-- Fix: Backfill the column from JSONB data.

UPDATE invoice_extractions
SET gemini_response_time_ms = (extraction_data->>'processing_time_ms')::int
WHERE gemini_response_time_ms IS NULL
AND extraction_data->>'processing_time_ms' IS NOT NULL;
