-- Fix: invoices.user_id should reference users(id), not auth.users(id)
ALTER TABLE invoices DROP CONSTRAINT invoices_user_id_fkey;
ALTER TABLE invoices ADD CONSTRAINT invoices_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);

-- Also allow empty customer_email (we'll fill it from user lookup)
ALTER TABLE invoices ALTER COLUMN customer_email DROP NOT NULL;
