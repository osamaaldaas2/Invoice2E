-- Migration 034: Add missing FK indexes (LOW)
-- Problem: password_reset_tokens.user_id and voucher_redemptions.voucher_id lack indexes.
-- Fix: Create covering indexes for these foreign keys.

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id
    ON password_reset_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_voucher_id
    ON voucher_redemptions(voucher_id);
