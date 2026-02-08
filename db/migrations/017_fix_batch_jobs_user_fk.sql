-- Ensure batch_jobs.user_id points to public.users(id), not legacy auth.users mappings.
-- This keeps custom-auth user IDs compatible with batch uploads.

-- Best-effort data remap for legacy rows where batch_jobs.user_id stored auth.users.id.
DO $$
BEGIN
    UPDATE public.batch_jobs bj
    SET user_id = pu.id
    FROM auth.users au
    JOIN public.users pu
      ON lower(pu.email) = lower(au.email)
    WHERE bj.user_id = au.id
      AND bj.user_id <> pu.id;
EXCEPTION
    WHEN undefined_table THEN
        -- auth.users may be unavailable in some environments.
        NULL;
END $$;

ALTER TABLE public.batch_jobs
DROP CONSTRAINT IF EXISTS batch_jobs_user_id_fkey;

ALTER TABLE public.batch_jobs
ADD CONSTRAINT batch_jobs_user_id_fkey
FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE NOT VALID;
