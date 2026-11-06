# PayFlow Database ER Diagram

## Scope
ER Diagram of the 9 database tables
based on SRS Section 5.1.

## Important Relationships
- Users to Wallets
- Wallets to Ledger Entries
- Transactions to Ledger Entries
- Users to Transactions
- Wallets to Transactions
- Users to Cashout Requests
- Transactions to Cashout Requests
- Users to Idempotency Keys
- Users to Refresh Tokens
- Users to Audit Logs

## Business Rules
1. Every transaction has exactly two ledger entries.
2. Treasury wallet can have NULL user_id.
3. Monetary values use NUMERIC(14,2).
4. Ledger entries and audit logs are append-only.
5. Pending cashout requests can have NULL transaction_id.