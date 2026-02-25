-- Fix: Change pdf_data from BYTEA to TEXT to store base64-encoded PDF
-- Supabase JS client mangles BYTEA (hex encoding), TEXT with base64 is reliable
ALTER TABLE invoices ALTER COLUMN pdf_data TYPE TEXT;
