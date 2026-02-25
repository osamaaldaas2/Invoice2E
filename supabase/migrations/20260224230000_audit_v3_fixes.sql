-- F-001: FORCE RLS on invoices table (consistency with all other tables)
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
