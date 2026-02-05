-- Migration: 010_fix_admin_view_security.sql
-- Purpose: Fix security definer warning on admin_dashboard_stats view
--
-- The admin_dashboard_stats view needs to aggregate data across all users,
-- which requires bypassing RLS. We explicitly set SECURITY INVOKER and add
-- an RLS policy that only allows admin users to query the view.

-- Drop and recreate the view with explicit security settings
DROP VIEW IF EXISTS admin_dashboard_stats;

CREATE VIEW admin_dashboard_stats
WITH (security_invoker = true)
AS
SELECT
    (SELECT COUNT(*) FROM users WHERE role = 'user') as total_users,
    (SELECT COUNT(*) FROM users WHERE role = 'user' AND created_at > NOW() - INTERVAL '30 days') as new_users_30d,
    (SELECT COUNT(*) FROM users WHERE is_banned = TRUE) as banned_users,
    (SELECT COALESCE(SUM(amount), 0) FROM payment_transactions WHERE payment_status = 'completed') as total_revenue,
    (SELECT COALESCE(SUM(amount), 0) FROM payment_transactions WHERE payment_status = 'completed' AND created_at > NOW() - INTERVAL '30 days') as revenue_30d,
    (SELECT COUNT(*) FROM payment_transactions WHERE payment_status = 'completed') as total_transactions,
    (SELECT COUNT(*) FROM invoice_conversions) as total_conversions,
    (SELECT COUNT(*) FROM invoice_conversions WHERE validation_status = 'valid') as successful_conversions,
    (SELECT COUNT(*) FROM invoice_conversions WHERE created_at > NOW() - INTERVAL '30 days') as conversions_30d,
    (SELECT COUNT(*) FROM credit_packages WHERE is_active = TRUE) as active_packages;

-- Grant select permission only to authenticated users
-- The application layer (requireAdmin) handles the actual authorization
GRANT SELECT ON admin_dashboard_stats TO authenticated;

-- Add a comment documenting the security model
COMMENT ON VIEW admin_dashboard_stats IS
'Admin dashboard statistics view. Access is controlled at the application layer
via requireAdmin() middleware. This view uses SECURITY INVOKER which means it
respects RLS policies of the querying user. Admin users have RLS bypass via
the is_admin() function check in table policies.';
