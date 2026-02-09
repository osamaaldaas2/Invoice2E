-- Add XML content cache columns to invoice_conversions
-- Avoids regenerating XML when downloading previously converted invoices

ALTER TABLE invoice_conversions
    ADD COLUMN IF NOT EXISTS xml_content TEXT,
    ADD COLUMN IF NOT EXISTS xml_file_name VARCHAR(255);
