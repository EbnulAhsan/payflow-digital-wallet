
-- PayFlow: Rollback initial database schema

-- Revoke database and schema permissions first
DO $$
BEGIN
    EXECUTE format(
        'REVOKE CONNECT ON DATABASE %I FROM payflow_app',
        current_database()
    );
END
$$;
REVOKE USAGE ON SCHEMA public FROM payflow_app;

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS idempotency_keys;
DROP TABLE IF EXISTS cashout_requests;
DROP TABLE IF EXISTS ledger_entries;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS wallets;
DROP TABLE IF EXISTS users;

-- Drop ENUM types
DROP TYPE IF EXISTS co_status;
DROP TYPE IF EXISTS txn_status;
DROP TYPE IF EXISTS txn_type;
DROP TYPE IF EXISTS wallet_kind;
DROP TYPE IF EXISTS user_status;
DROP TYPE IF EXISTS user_role;

-- PostgreSQL roles are cluster-wide and may be used by other databases.
