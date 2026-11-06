# WAL-02.3 — Design the Double-Entry Ledger, Treasury Wallet and Append-Only Grants

**Covers:** BR-02 to BR-04, BR-11, SRS §5.2

## Double-entry ledger

Each completed transaction has exactly two ledger entries: one negative debit and one positive credit. Their amounts sum to zero. Each entry references an existing transaction and wallet.

```sql
CREATE TABLE ledger_entries (
    id BIGSERIAL PRIMARY KEY,
    transaction_id BIGINT NOT NULL REFERENCES transactions(id),
    wallet_id BIGINT NOT NULL REFERENCES wallets(id),
    amount NUMERIC(14,2) NOT NULL CHECK (amount <> 0),
    balance_after NUMERIC(14,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (transaction_id, wallet_id)
);
```

Exactly two entries and a zero sum must be validated by transaction-level application logic or database enforcement.

## Treasury wallet

Only one TREASURY wallet may exist, and it has no user. USER wallets require a user and cannot have a negative balance. A TREASURY wallet may have a negative balance.

```sql
CHECK (balance >= 0 OR kind = 'TREASURY');
CHECK ((kind = 'USER') = (user_id IS NOT NULL));

CREATE UNIQUE INDEX one_treasury
    ON wallets (kind)
    WHERE kind = 'TREASURY';
```

## Money-table CHECK constraints

| Table | CHECK constraints |
|---|---|
| `wallets` | `CHECK (balance >= 0 OR kind = 'TREASURY')`; `CHECK ((kind = 'USER') = (user_id IS NOT NULL))` |
| `transactions` | `CHECK (amount > 0)`; `CHECK (from_wallet_id <> to_wallet_id)`; `CHECK ((status = 'FAILED') = (failure_code IS NOT NULL))` |
| `ledger_entries` | `CHECK (amount <> 0)` |
| `cashout_requests` | `CHECK (amount > 0)` |

## Money-table REVOKE statements

| Table | REVOKE |
|---|---|
| `wallets` | — |
| `transactions` | `REVOKE DELETE ON transactions FROM payflow_app;` |
| `ledger_entries` | `REVOKE UPDATE, DELETE ON ledger_entries FROM payflow_app;` |
| `cashout_requests` | — |
| `audit_logs` | `REVOKE UPDATE, DELETE ON audit_logs FROM payflow_app;` |
