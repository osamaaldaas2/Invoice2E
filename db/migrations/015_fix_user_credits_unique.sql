-- Migration: 015_fix_user_credits_unique.sql
-- Purpose: Ensure user_credits has a unique constraint on user_id for ON CONFLICT usage

-- =============================================
-- DEDUPE USER_CREDITS IF NEEDED
-- =============================================

WITH duplicates AS (
    SELECT user_id
    FROM public.user_credits
    GROUP BY user_id
    HAVING COUNT(*) > 1
),
keepers AS (
    SELECT DISTINCT ON (user_id) user_id, id AS keep_id
    FROM public.user_credits
    ORDER BY user_id, created_at ASC, id ASC
),
summed AS (
    SELECT user_id,
           COALESCE(SUM(available_credits), 0) AS total_available,
           COALESCE(SUM(used_credits), 0) AS total_used
    FROM public.user_credits
    GROUP BY user_id
)
UPDATE public.user_credits uc
SET available_credits = s.total_available,
    used_credits = s.total_used,
    updated_at = CURRENT_TIMESTAMP
FROM duplicates d
JOIN summed s ON s.user_id = d.user_id
JOIN keepers k ON k.user_id = d.user_id
WHERE uc.id = k.keep_id;

DELETE FROM public.user_credits uc
USING (
    SELECT user_id
    FROM public.user_credits
    GROUP BY user_id
    HAVING COUNT(*) > 1
) d
JOIN (
    SELECT DISTINCT ON (user_id) user_id, id AS keep_id
    FROM public.user_credits
    ORDER BY user_id, created_at ASC, id ASC
) k ON k.user_id = d.user_id
WHERE uc.user_id = d.user_id
  AND uc.id <> k.keep_id;

-- =============================================
-- ADD UNIQUE CONSTRAINT / INDEX
-- =============================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_credits_user_id_unique
    ON public.user_credits (user_id);
