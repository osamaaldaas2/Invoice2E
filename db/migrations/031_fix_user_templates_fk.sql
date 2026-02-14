-- Migration 031: Fix user_templates FK (MEDIUM)
-- Problem: Live DB has user_templates.user_id referencing auth.users.id
-- instead of public.users.id. Since the app uses custom auth (public.users),
-- template creation would fail with FK violations.
-- Fix: Drop and recreate the FK constraint pointing to public.users.

ALTER TABLE user_templates DROP CONSTRAINT IF EXISTS user_templates_user_id_fkey;

ALTER TABLE user_templates
    ADD CONSTRAINT user_templates_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
