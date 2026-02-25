-- Migration: Create invoices table for PDF invoice generation after payment
-- Created: 2026-02-24

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  payment_transaction_id UUID REFERENCES payment_transactions(id),
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  amount_net NUMERIC(10,2) NOT NULL,
  amount_vat NUMERIC(10,2) NOT NULL,
  amount_gross NUMERIC(10,2) NOT NULL,
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 19.00,
  currency TEXT NOT NULL DEFAULT 'EUR',
  description TEXT NOT NULL,
  credits_purchased INTEGER NOT NULL,
  payment_method TEXT NOT NULL,
  pdf_data BYTEA, -- store PDF binary
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sequential invoice number generator
CREATE SEQUENCE invoice_number_seq START 1;

-- RPC to generate next invoice number atomically
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT AS $$
DECLARE
  seq_val INTEGER;
  year_part TEXT;
BEGIN
  seq_val := nextval('invoice_number_seq');
  year_part := to_char(now(), 'YYYY');
  RETURN 'RE-' || year_part || '-' || lpad(seq_val::text, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- RLS
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Users can read their own invoices
CREATE POLICY invoices_select_own ON invoices FOR SELECT USING (auth.uid() = user_id);

-- Service role can insert (service role bypasses RLS, but explicit policy for clarity)
CREATE POLICY invoices_insert_service ON invoices FOR INSERT WITH CHECK (true);
