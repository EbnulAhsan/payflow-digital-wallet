# PayFlow Backend Service

PayFlow v1.0 REST API service built with NestJS 10, TypeScript, and PostgreSQL 16.

🚀 Prerequisites
- Node.js 20 LTS
- npm (v18+)
- PostgreSQL 16 (or Docker Compose)

🛠 Quick Local Setup (<= 15 minutes)

### 1. Environment Variables
Copy the example environment file:
```bash
cp .env.example .env
```

### 2. Start PostgreSQL and apply migrations
Run the following commands from `payflow-backend/`:

```bash
docker compose up -d postgres
docker compose --profile tools run --rm migrate up
```

To verify that the migrations build the schema from an empty database and roll
back cleanly, use a disposable local database. The first command removes the
Compose database volume and all data stored in it:

```bash
docker compose down -v
docker compose up -d postgres
docker compose --profile tools run --rm migrate up
docker compose --profile tools run --rm migrate down
docker compose --profile tools run --rm migrate up
```

### 3. Load demo data
After applying the migrations, copy and run the seed script:

```bash
docker compose cp seed/seed.sql postgres:/tmp/seed.sql
docker compose exec -T postgres psql -U payflow_admin -d payflow_db -v ON_ERROR_STOP=1 -f /tmp/seed.sql
```

The seed is repeatable. Run the `psql` command again to check that it does not
create duplicate data. Check the expected row counts with:

```bash
docker compose exec -T postgres psql -U payflow_admin -d payflow_db -c "SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM wallets) AS wallets, (SELECT count(*) FROM transactions) AS transactions, (SELECT count(*) FROM ledger_entries) AS ledger_entries;"
```

The expected counts are 29 users, 30 wallets, 18 transactions, and 36 ledger
entries. To stop PostgreSQL without deleting its data, run
`docker compose down` from `payflow-backend/`.
