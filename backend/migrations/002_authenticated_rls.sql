-- LedgerLens production tenant isolation for FastAPI's opaque sessions.
-- Run as the Supabase database owner. The FastAPI connection role must have
-- NOBYPASSRLS; never use a Supabase service-role key in the application.

-- The custom application session system needs server-only access to these two
-- tables during login/session validation. Financial records remain RLS-bound.
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE sessions DISABLE ROW LEVEL SECURITY;

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

ALTER TABLE categories FORCE ROW LEVEL SECURITY;
ALTER TABLE transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE budgets FORCE ROW LEVEL SECURITY;
ALTER TABLE goals FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS categories_tenant_visibility ON categories;
DROP POLICY IF EXISTS transactions_tenant_isolation ON transactions;
DROP POLICY IF EXISTS budgets_tenant_isolation ON budgets;
DROP POLICY IF EXISTS goals_tenant_isolation ON goals;

CREATE POLICY categories_tenant_visibility ON categories
  FOR ALL
  USING (
    user_id IS NULL
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  )
  WITH CHECK (
    user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );

CREATE POLICY transactions_tenant_isolation ON transactions
  FOR ALL
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

CREATE POLICY budgets_tenant_isolation ON budgets
  FOR ALL
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

CREATE POLICY goals_tenant_isolation ON goals
  FOR ALL
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

-- Create this role with a strong password held only by the FastAPI host.
-- Supabase pooler connection details can differ by project; use the role's
-- connection string shown in Supabase after creating the login role.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_backend') THEN
    CREATE ROLE app_backend LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD 'REPLACE_BEFORE_RUNNING';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO app_backend;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE categories, transactions, budgets, goals TO app_backend;
GRANT SELECT, INSERT, UPDATE ON TABLE users, sessions TO app_backend;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
