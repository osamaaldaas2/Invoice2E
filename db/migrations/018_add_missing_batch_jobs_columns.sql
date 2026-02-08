-- Compatibility migration for environments where batch_jobs was created
-- without all expected queue/storage columns.

ALTER TABLE public.batch_jobs
  ADD COLUMN IF NOT EXISTS input_file_path TEXT,
  ADD COLUMN IF NOT EXISTS output_file_path TEXT,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMP;
