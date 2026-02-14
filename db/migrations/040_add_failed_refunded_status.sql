-- Migration 040: Add 'failed_refunded' status to batch_jobs
-- When a batch job fails but credits are successfully refunded,
-- the status should reflect that the user was made whole.

ALTER TABLE batch_jobs DROP CONSTRAINT batch_jobs_status_check;
ALTER TABLE batch_jobs ADD CONSTRAINT batch_jobs_status_check
  CHECK (status = ANY (ARRAY[
    'pending', 'processing', 'completed', 'failed',
    'cancelled', 'failed_refunded'
  ]));
