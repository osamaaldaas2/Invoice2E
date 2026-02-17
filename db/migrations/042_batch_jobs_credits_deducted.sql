-- R-1/R-5 fix: Prevent double credit deduction on stuck batch job recovery
-- When recoverStuckJobs() resets a job to 'pending', the re-run would deduct
-- credits again. This flag ensures credits are only deducted once per job.
ALTER TABLE batch_jobs
  ADD COLUMN IF NOT EXISTS credits_deducted BOOLEAN NOT NULL DEFAULT false;
