-- Migration 029: Fix mutable search_path on SECURITY DEFINER functions (CRITICAL)
-- Problem: 3 functions lack SET search_path, allowing search_path injection.
-- Fix: Set search_path = 'public' on all 3 functions.
-- NOTE: Using 'public' instead of '' because function bodies reference
-- unqualified table names (user_credits, audit_logs, credit_transactions).

ALTER FUNCTION public.add_credits(uuid, integer, character varying, character varying)
    SET search_path = 'public';

ALTER FUNCTION public.safe_deduct_credits(uuid, integer, character varying)
    SET search_path = 'public';

ALTER FUNCTION public.verify_and_add_credits(uuid, integer, character varying, character varying, character varying, character varying)
    SET search_path = 'public';
