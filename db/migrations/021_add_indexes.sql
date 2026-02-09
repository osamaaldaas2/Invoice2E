-- Migration 021: Add indexes on frequently queried columns

-- invoice_extractions: queried by user_id in history, batch-download, analytics
CREATE INDEX IF NOT EXISTS idx_invoice_extractions_user_id
    ON invoice_extractions(user_id);

-- batch_jobs: queried by status (worker polling) and user_id (listing/status)
CREATE INDEX IF NOT EXISTS idx_batch_jobs_status
    ON batch_jobs(status);

CREATE INDEX IF NOT EXISTS idx_batch_jobs_user_id
    ON batch_jobs(user_id);

-- payment_transactions: queried by user_id for payment history
CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_id
    ON payment_transactions(user_id);
