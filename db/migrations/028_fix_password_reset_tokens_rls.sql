-- Migration 028: Fix password_reset_tokens RLS (CRITICAL)
-- Problem: Policy "Service role manages reset tokens" uses USING(true) WITH CHECK(true)
-- for the public role, allowing ANY user to read/modify all reset tokens.
-- Fix: Drop the permissive policy. Service role bypasses RLS by default,
-- so no replacement policy is needed for service_role access.

DROP POLICY IF EXISTS "Service role manages reset tokens" ON password_reset_tokens;

-- Create a deny-all policy for public/anon roles as defense-in-depth
-- (RLS is already enabled, so no policy = no access, but this is explicit)
CREATE POLICY "Deny all public access to reset tokens"
    ON password_reset_tokens
    FOR ALL
    TO public
    USING (false)
    WITH CHECK (false);
