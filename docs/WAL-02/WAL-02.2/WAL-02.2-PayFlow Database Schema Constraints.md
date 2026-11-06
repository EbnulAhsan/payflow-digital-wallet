# WAL-02.2 — PayFlow Database Schema Constraints

**SRS:** §5.2

| Table | Primary key | Unique constraints / indexes | CHECK constraints | Foreign keys |
|---|---|---|---|---|
| `users` | `id` | `mobile`; `email` | `mobile ~ '^01[3-9][0-9]{8}$'` | — |
| `wallets` | `id` | `user_id`; partial unique index on `kind` where `kind = 'TREASURY'` | `balance >= 0 OR kind = 'TREASURY'`; `(kind = 'USER') = (user_id IS NOT NULL)` | `user_id → users.id` (nullable) |
| `transactions` | `id` | `reference` | `amount > 0`; `from_wallet_id <> to_wallet_id`; `(status = 'FAILED') = (failure_code IS NOT NULL)` | `from_wallet_id → wallets.id`; `to_wallet_id → wallets.id`; `initiated_by → users.id` |
| `ledger_entries` | `id` | `(transaction_id, wallet_id)` | `amount <> 0` | `transaction_id → transactions.id`; `wallet_id → wallets.id` |
| `cashout_requests` | `id` | `transaction_id`; partial unique index on `(agent_id, customer_id)` where `status = 'PENDING_AUTHORIZATION'` | `amount > 0` | `agent_id → users.id`; `customer_id → users.id`; `transaction_id → transactions.id` (nullable) |
| `idempotency_keys` | `(user_id, key)` | — | `state IN ('IN_PROGRESS', 'DONE')` | `user_id → users.id` |
| `refresh_tokens` | `id` | `token_hash` | — | `user_id → users.id` |
| `audit_logs` | `id` | — | — | `actor_id → users.id` (nullable) |
| `settings` | `key` | — | — | — |
