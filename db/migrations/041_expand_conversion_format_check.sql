-- Migration 041: Expand chk_conversion_format for multi-format support
-- The original constraint (migration 032) only allowed ('XRechnung', 'CII', 'UBL').
-- Now that 9 output formats are supported, the constraint must include all
-- legacy format strings returned by toLegacyFormat().

ALTER TABLE invoice_conversions
    DROP CONSTRAINT IF EXISTS chk_conversion_format;

ALTER TABLE invoice_conversions
    ADD CONSTRAINT chk_conversion_format
    CHECK (conversion_format IN (
        'XRechnung',
        'CII',
        'UBL',
        'PEPPOL BIS',
        'Factur-X EN16931',
        'Factur-X Basic',
        'FatturaPA',
        'KSeF',
        'NLCIUS',
        'CIUS-RO'
    ));
