-- Verify FORCE RLS is active on all tenant tables
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN (
    'users', 'user_credits', 'invoice_extractions', 'invoice_conversions',
    'payment_transactions', 'audit_logs', 'api_keys'
);

-- Verify no remaining createServerClient usage (run in codebase, not DB)
-- grep -rn "createServerClient" --include="*.ts" --include="*.tsx" lib/ app/ services/ adapters/

-- Verify idempotency index exists
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'credit_transactions' AND indexname LIKE '%idempotency%';
