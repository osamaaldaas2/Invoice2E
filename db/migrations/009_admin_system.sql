-- Migration 009: Admin System
-- Adds role-based authorization, admin audit logging, and enhanced user management

-- =============================================
-- PART 1: USER ROLE SYSTEM
-- =============================================

-- Create enum for user roles
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('user', 'admin', 'super_admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add role and admin-specific columns to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS role user_role DEFAULT 'user',
ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS banned_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS banned_reason TEXT,
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0;

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_banned ON users(is_banned) WHERE is_banned = TRUE;

-- =============================================
-- PART 2: ADMIN AUDIT LOGS TABLE
-- =============================================

-- Separate table for admin actions with detailed tracking
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Who performed the action
    admin_user_id UUID NOT NULL REFERENCES users(id),

    -- Target of the action (optional - for user-related actions)
    target_user_id UUID REFERENCES users(id),

    -- What action was performed
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL, -- 'user', 'package', 'transaction', 'system'
    resource_id VARCHAR(255),

    -- State tracking
    old_values JSONB,
    new_values JSONB,

    -- Request context (for security investigation)
    ip_address VARCHAR(45),
    user_agent TEXT,

    -- Timestamp
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for admin audit queries
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin_id ON admin_audit_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target_id ON admin_audit_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action ON admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_resource ON admin_audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at ON admin_audit_logs(created_at DESC);

-- =============================================
-- PART 3: HELPER FUNCTIONS
-- =============================================

-- Function to check if user is admin (for RLS policies)
CREATE OR REPLACE FUNCTION is_admin(check_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM users
        WHERE id = check_user_id
        AND role IN ('admin', 'super_admin')
        AND is_banned = FALSE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is super admin
CREATE OR REPLACE FUNCTION is_super_admin(check_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM users
        WHERE id = check_user_id
        AND role = 'super_admin'
        AND is_banned = FALSE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment login count atomically
CREATE OR REPLACE FUNCTION increment_login_count(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_new_count INTEGER;
BEGIN
    UPDATE users
    SET login_count = COALESCE(login_count, 0) + 1,
        last_login_at = CURRENT_TIMESTAMP
    WHERE id = p_user_id
    RETURNING login_count INTO v_new_count;

    RETURN v_new_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- PART 4: RLS POLICIES FOR ADMIN ACCESS
-- =============================================

-- Note: These policies extend existing RLS. Run after enabling RLS on tables.

-- Drop existing restrictive policies if they exist (to recreate with admin access)
-- Users table: Admins can view all users
DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can view themselves" ON users;
    DROP POLICY IF EXISTS "Admins can view all users" ON users;
    DROP POLICY IF EXISTS "Admins can update users" ON users;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

CREATE POLICY "Users can view themselves or admins can view all" ON users
    FOR SELECT USING (
        id::text = auth.uid()::text
        OR is_admin(auth.uid()::uuid)
    );

CREATE POLICY "Users can update themselves or admins can update" ON users
    FOR UPDATE USING (
        id::text = auth.uid()::text
        OR is_admin(auth.uid()::uuid)
    );

-- User credits: Admin access
DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can view own credits" ON user_credits;
    DROP POLICY IF EXISTS "Admins can view all credits" ON user_credits;
    DROP POLICY IF EXISTS "Admins can update credits" ON user_credits;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

CREATE POLICY "Users view own or admins view all credits" ON user_credits
    FOR SELECT USING (
        user_id::text = auth.uid()::text
        OR is_admin(auth.uid()::uuid)
    );

CREATE POLICY "Admins can update any credits" ON user_credits
    FOR UPDATE USING (
        is_admin(auth.uid()::uuid)
    );

-- Payment transactions: Admin access
DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can view own transactions" ON payment_transactions;
    DROP POLICY IF EXISTS "Admins can view all transactions" ON payment_transactions;
    DROP POLICY IF EXISTS "Admins can update transactions" ON payment_transactions;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

CREATE POLICY "Users view own or admins view all transactions" ON payment_transactions
    FOR SELECT USING (
        user_id::text = auth.uid()::text
        OR is_admin(auth.uid()::uuid)
    );

CREATE POLICY "Admins can update transactions" ON payment_transactions
    FOR UPDATE USING (
        is_admin(auth.uid()::uuid)
    );

-- Invoice conversions: Admin access
DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can view own conversions" ON invoice_conversions;
    DROP POLICY IF EXISTS "Admins can view all conversions" ON invoice_conversions;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

CREATE POLICY "Users view own or admins view all conversions" ON invoice_conversions
    FOR SELECT USING (
        user_id::text = auth.uid()::text
        OR is_admin(auth.uid()::uuid)
    );

-- Credit packages: Admin full management
DO $$ BEGIN
    DROP POLICY IF EXISTS "Anyone can view active packages" ON credit_packages;
    DROP POLICY IF EXISTS "Admins can manage packages" ON credit_packages;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

CREATE POLICY "Anyone can view active packages" ON credit_packages
    FOR SELECT USING (is_active = TRUE OR is_admin(auth.uid()::uuid));

CREATE POLICY "Admins can insert packages" ON credit_packages
    FOR INSERT WITH CHECK (is_admin(auth.uid()::uuid));

CREATE POLICY "Admins can update packages" ON credit_packages
    FOR UPDATE USING (is_admin(auth.uid()::uuid));

CREATE POLICY "Super admins can delete packages" ON credit_packages
    FOR DELETE USING (is_super_admin(auth.uid()::uuid));

-- Admin audit logs: Only admins can view, service role inserts
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs" ON admin_audit_logs
    FOR SELECT USING (is_admin(auth.uid()::uuid));

-- =============================================
-- PART 5: ADMIN DASHBOARD VIEW
-- =============================================

-- Create a view for dashboard statistics
CREATE OR REPLACE VIEW admin_dashboard_stats AS
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

-- =============================================
-- PART 6: ADMIN CREDIT MODIFICATION FUNCTION
-- =============================================

-- Function for admin to modify user credits with audit trail
CREATE OR REPLACE FUNCTION admin_modify_credits(
    p_admin_id UUID,
    p_target_user_id UUID,
    p_amount INTEGER,
    p_reason TEXT,
    p_ip_address VARCHAR(45) DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS TABLE(new_balance INTEGER, audit_log_id UUID) AS $$
DECLARE
    v_old_credits INTEGER;
    v_new_credits INTEGER;
    v_audit_id UUID;
BEGIN
    -- Verify admin has permission
    IF NOT is_admin(p_admin_id) THEN
        RAISE EXCEPTION 'Unauthorized: Admin role required';
    END IF;

    -- Get current credits
    SELECT available_credits INTO v_old_credits
    FROM user_credits
    WHERE user_id = p_target_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User credits record not found';
    END IF;

    -- Calculate new balance (prevent negative)
    v_new_credits := GREATEST(0, v_old_credits + p_amount);

    -- Update credits
    UPDATE user_credits
    SET available_credits = v_new_credits,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = p_target_user_id;

    -- Log the admin action
    INSERT INTO admin_audit_logs (
        admin_user_id,
        target_user_id,
        action,
        resource_type,
        resource_id,
        old_values,
        new_values,
        ip_address,
        user_agent
    ) VALUES (
        p_admin_id,
        p_target_user_id,
        CASE WHEN p_amount >= 0 THEN 'credits_added' ELSE 'credits_removed' END,
        'user_credits',
        p_target_user_id::text,
        jsonb_build_object('available_credits', v_old_credits),
        jsonb_build_object('available_credits', v_new_credits, 'change', p_amount, 'reason', p_reason),
        p_ip_address,
        p_user_agent
    ) RETURNING id INTO v_audit_id;

    RETURN QUERY SELECT v_new_credits, v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- PART 7: SETUP FIRST ADMIN HELPER
-- =============================================

-- Use this to promote first admin (run once after migration):
-- SELECT setup_first_admin('your-admin-email@example.com');

CREATE OR REPLACE FUNCTION setup_first_admin(admin_email VARCHAR(255))
RETURNS TEXT AS $$
DECLARE
    v_count INT;
    v_user_id UUID;
BEGIN
    -- Check if any super admin exists
    SELECT COUNT(*) INTO v_count FROM users WHERE role = 'super_admin';

    -- Only allow if no super admin exists yet (first-time setup)
    IF v_count > 0 THEN
        RETURN 'Super admin already exists. Use admin panel to promote users.';
    END IF;

    -- Find and promote user
    UPDATE users
    SET role = 'super_admin'
    WHERE email = admin_email
    RETURNING id INTO v_user_id;

    IF v_user_id IS NULL THEN
        RETURN 'User not found with email: ' || admin_email;
    END IF;

    RETURN 'Successfully promoted to super_admin: ' || v_user_id::text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- MIGRATION COMPLETE
-- =============================================
-- Next steps:
-- 1. Run this migration in your Supabase SQL editor
-- 2. Promote your first admin: SELECT setup_first_admin('your-email@example.com');
-- 3. Test with: SELECT * FROM users WHERE role = 'super_admin';
