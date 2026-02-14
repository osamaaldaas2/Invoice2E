-- Migration 032: Normalize conversion_format case (MEDIUM)
-- Problem: 293 rows have 'XRechnung', 17 have 'xrechnung' (lowercase).
-- Fix: Normalize all to 'XRechnung' and add a CHECK constraint.

UPDATE invoice_conversions
SET conversion_format = 'XRechnung'
WHERE conversion_format = 'xrechnung';

-- Add CHECK constraint to prevent future case inconsistencies
ALTER TABLE invoice_conversions
    ADD CONSTRAINT chk_conversion_format
    CHECK (conversion_format IN ('XRechnung', 'CII', 'UBL'));
