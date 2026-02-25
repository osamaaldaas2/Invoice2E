-- P0-1: Prevent duplicate invoices per payment transaction
CREATE UNIQUE INDEX invoices_payment_transaction_unique 
  ON invoices (payment_transaction_id) 
  WHERE payment_transaction_id IS NOT NULL;

-- P2-4: Add rate limiting comment (rate limiting is app-side, not DB-side)
-- No DB changes needed for rate limiting.
