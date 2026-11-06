
-- PayFlow: Initial database schema
-- PostgreSQL 16

-- 1. Create application role (separate from database admin)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_roles WHERE rolname = 'payflow_app'
    ) THEN
        EXECUTE 'CREATE ROLE payflow_app LOGIN PASSWORD ''payflow_app_dev_password''';
    END IF;
END
$$;

-- 2. ENUM types
CREATE TYPE user_role AS ENUM (
    'ADMIN', 'AGENT', 'CUSTOMER', 'MERCHANT'
);

CREATE TYPE user_status AS ENUM (
    'PENDING', 'ACTIVE', 'INACTIVE', 'REJECTED'
);

CREATE TYPE wallet_kind AS ENUM (
    'USER', 'TREASURY'
);

CREATE TYPE txn_type AS ENUM (
    'ALLOCATION', 'CASH_IN', 'SEND_MONEY', 'PAYMENT', 'CASH_OUT'
);

CREATE TYPE txn_status AS ENUM (
    'PENDING', 'COMPLETED', 'FAILED'
);

CREATE TYPE co_status AS ENUM (
    'PENDING_AUTHORIZATION', 'COMPLETED', 'REJECTED',
    'CANCELLED', 'EXPIRED'
);

-- 3. Users
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    full_name VARCHAR(120) NOT NULL,
    mobile CHAR(11) NOT NULL UNIQUE
        CHECK (mobile ~ '^01[3-9][0-9]{8}$'),
    email VARCHAR(254) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role user_role NOT NULL,
    status user_status NOT NULL DEFAULT 'PENDING',
    must_reset_pw BOOLEAN NOT NULL DEFAULT FALSE,
    failed_logins SMALLINT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    status_reason VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Wallets
CREATE TABLE wallets (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT UNIQUE REFERENCES users(id),
    kind wallet_kind NOT NULL DEFAULT 'USER',
    balance NUMERIC(14,2) NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (balance >= 0 OR kind = 'TREASURY'),
    CHECK ((kind = 'USER') = (user_id IS NOT NULL))
);

CREATE UNIQUE INDEX one_treasury
ON wallets(kind)
WHERE kind = 'TREASURY';

-- 5. Transactions
CREATE TABLE transactions (
    id BIGSERIAL PRIMARY KEY,
    reference CHAR(20) NOT NULL UNIQUE,
    type txn_type NOT NULL,
    status txn_status NOT NULL DEFAULT 'PENDING',
    amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    from_wallet_id BIGINT NOT NULL REFERENCES wallets(id),
    to_wallet_id BIGINT NOT NULL REFERENCES wallets(id),
    initiated_by BIGINT NOT NULL REFERENCES users(id),
    note VARCHAR(140),
    failure_code VARCHAR(40),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    CHECK (from_wallet_id <> to_wallet_id),
    CHECK ((status = 'FAILED') = (failure_code IS NOT NULL))
);

CREATE INDEX txn_from_created
ON transactions(from_wallet_id, created_at DESC);

CREATE INDEX txn_to_created
ON transactions(to_wallet_id, created_at DESC);

CREATE INDEX txn_type_created
ON transactions(type, created_at);

-- 6. Ledger entries
CREATE TABLE ledger_entries (
    id BIGSERIAL PRIMARY KEY,
    transaction_id BIGINT NOT NULL REFERENCES transactions(id),
    wallet_id BIGINT NOT NULL REFERENCES wallets(id),
    amount NUMERIC(14,2) NOT NULL CHECK (amount <> 0),
    balance_after NUMERIC(14,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (transaction_id, wallet_id)
);

CREATE INDEX ledger_wallet_created
ON ledger_entries(wallet_id, created_at DESC);

-- 7. Cashout requests
CREATE TABLE cashout_requests (
    id BIGSERIAL PRIMARY KEY,
    agent_id BIGINT NOT NULL REFERENCES users(id),
    customer_id BIGINT NOT NULL REFERENCES users(id),
    amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    status co_status NOT NULL DEFAULT 'PENDING_AUTHORIZATION',
    transaction_id BIGINT UNIQUE REFERENCES transactions(id),
    expires_at TIMESTAMPTZ NOT NULL,
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX one_pending_cashout
ON cashout_requests(agent_id, customer_id)
WHERE status = 'PENDING_AUTHORIZATION';

-- 8. Idempotency keys
CREATE TABLE idempotency_keys (
    user_id BIGINT NOT NULL REFERENCES users(id),
    key UUID NOT NULL,
    request_hash CHAR(64) NOT NULL,
    state VARCHAR(12) NOT NULL
        CHECK (state IN ('IN_PROGRESS', 'DONE')),
    response_code SMALLINT,
    response_body JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, key)
);

-- 9. Refresh tokens
CREATE TABLE refresh_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);

-- 10. Audit logs
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_id BIGINT REFERENCES users(id),
    action VARCHAR(60) NOT NULL,
    entity_type VARCHAR(40) NOT NULL,
    entity_id BIGINT NOT NULL,
    before_data JSONB,
    after_data JSONB,
    ip_address INET,
    request_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_entity
ON audit_logs(entity_type, entity_id, created_at DESC);

-- 11. Settings
CREATE TABLE settings (
    key VARCHAR(60) PRIMARY KEY,
    value JSONB NOT NULL
);

-- 12. Application permissions
GRANT CONNECT ON DATABASE payflow_db TO payflow_app;
GRANT USAGE ON SCHEMA public TO payflow_app;

GRANT SELECT, INSERT, UPDATE, DELETE
ON users, wallets, transactions, ledger_entries,
   cashout_requests, idempotency_keys, refresh_tokens, audit_logs, settings
TO payflow_app;

GRANT USAGE, SELECT
ON ALL SEQUENCES IN SCHEMA public
TO payflow_app;

-- Append-only protections
REVOKE UPDATE, DELETE ON ledger_entries, audit_logs FROM payflow_app;
REVOKE UPDATE, DELETE ON transactions FROM payflow_app;
