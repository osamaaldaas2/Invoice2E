-- Add accountant role to user_role enum

-- Add 'accountant' to enum if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum WHERE enumlabel = 'accountant'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
  ) THEN
    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'accountant';
  END IF;
END $$;

-- Add is_banned column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'is_banned'
  ) THEN
    ALTER TABLE users ADD COLUMN is_banned BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;
