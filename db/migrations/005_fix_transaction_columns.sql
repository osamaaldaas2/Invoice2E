-- Fix payment_transactions columns
-- Migration: 005_fix_transaction_columns.sql

-- Add missing columns if they don't exist
ALTER TABLE payment_transactions 
  ADD COLUMN IF NOT EXISTS stripe_payment_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS paypal_order_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS receipt_url TEXT;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_payment_transactions_stripe_id ON payment_transactions(stripe_payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_paypal_id ON payment_transactions(paypal_order_id);
