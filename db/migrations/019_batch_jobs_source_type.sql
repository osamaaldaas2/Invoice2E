-- Migration 019: Add source_type and boundary_data columns to batch_jobs
-- Supports multi-invoice PDF splitting as a background job

ALTER TABLE batch_jobs ADD COLUMN IF NOT EXISTS source_type VARCHAR(50) DEFAULT 'zip_upload';
ALTER TABLE batch_jobs ADD COLUMN IF NOT EXISTS boundary_data JSONB;
