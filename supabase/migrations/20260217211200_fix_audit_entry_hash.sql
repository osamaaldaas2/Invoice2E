-- Fix: make entry_hash nullable to prevent trigger failures from breaking writes
-- The trigger auto-populates it, but NOT NULL can cause issues if trigger errors occur
ALTER TABLE audit_logs ALTER COLUMN entry_hash DROP NOT NULL;
