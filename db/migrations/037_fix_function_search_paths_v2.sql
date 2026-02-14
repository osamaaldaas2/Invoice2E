-- Migration 037: Fix search_path to 'public' instead of '' (HOTFIX)
-- The previous migration (029) set search_path = '' which prevents the
-- functions from resolving unqualified table names like user_credits,
-- audit_logs, credit_transactions. Setting to 'public' is still secure
-- (prevents search_path injection) while allowing table resolution.

ALTER FUNCTION public.add_credits(uuid, integer, character varying, character varying)
    SET search_path = 'public';

ALTER FUNCTION public.safe_deduct_credits(uuid, integer, character varying)
    SET search_path = 'public';

ALTER FUNCTION public.verify_and_add_credits(uuid, integer, character varying, character varying, character varying, character varying)
    SET search_path = 'public';
