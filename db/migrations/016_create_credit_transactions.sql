-- Migration: 016_create_credit_transactions.sql
-- Purpose: Create credit_transactions table required by add_credits/deduct_credits functions

CREATE TABLE IF NOT EXISTS public.credit_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    transaction_type VARCHAR(20) NOT NULL, -- 'credit' | 'debit'
    source VARCHAR(50) NOT NULL,
    reference_id VARCHAR(255),
    balance_after INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id
    ON public.credit_transactions(user_id);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at
    ON public.credit_transactions(created_at DESC);

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Users view own or admins view all credit transactions" ON public.credit_transactions;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

CREATE POLICY "Users view own or admins view all credit transactions" ON public.credit_transactions
    FOR SELECT USING (
        user_id::text = auth.uid()::text
        OR is_admin(auth.uid()::uuid)
    );
