# PayFlow Digital Wallet & Transaction Management System

[![CI](https://github.com/EbnulAhsan/payflow-digital-wallet/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/EbnulAhsan/payflow-digital-wallet/actions/workflows/ci.yml)

This repository contains the source code for the PayFlow Digital Wallet (Group 2) as specified in the SRS v0.1.

## Project Structure

- [Backend API Service (NestJS)](./payflow-backend/README.md)
- [Frontend Web Application (React)](./payflow-frontend/README.md)

Please check the respective README files in the folders above for detailed setup instructions.

## CI and deployment (NFR-OPS-01, NFR-OPS-03)

- Every pull request runs lint, unit tests with the coverage gate (60% overall, 80% on the transaction engine once `payflow-backend/src/transactions` exists), the API tests against PostgreSQL 16 and the frontend checks.

### Branches and environments

- Work on a `feature/...` branch and open a pull request into `master`. `master` is staging: tests must pass and a reviewer must approve.
- The Release Master merges the pull request, and staging deploys.
- A release pull request from `master` into `main` goes to production. Never open a pull request into `main` from a feature branch.

### Hosting

- Vercel hosts the app as two projects: the API (root directory `payflow-backend`) and the web app (root directory `payflow-frontend`).
- Neon hosts PostgreSQL in the project `payflow` with a `production` branch and a `staging` branch. The database must be named `payflow_db`, because migration 001 grants access on that name.
- The web app calls the API at the same origin (`/api/v1`). A rewrite in `payflow-frontend/vercel.json` forwards `/api` to the API project, so the Secure refresh cookie keeps working.
- Staging web: https://payflow-digital-wallet-web-staging.vercel.app
- Production web: https://payflow-digital-wallet-web.vercel.app

### Environment variables

API project (Vercel):

- `DATABASE_URL`: pooled Neon connection string for the `payflow_app` role, ending with `?sslmode=require&pgbouncer=true&connect_timeout=15`
- `DIRECT_URL`: direct (not pooled) connection string of the database owner, used only by `npm run migrate` and `npm run seed`
- `APP_DB_PASSWORD`: password that `npm run migrate` sets on the `payflow_app` role
- `JWT_ACCESS_SECRET`: random secret of at least 32 bytes
- `CLIENT_URL`: URL of the web app for that environment
- `NODE_ENV`: `production`

Web project (Vercel):

- `VITE_API_BASE_URL`: `/api/v1`

Keep the real values only in Vercel and GitHub secrets. Never put them in the repository, chat or tickets.

### Migrations and seed data

- The API build command is `npm run prisma:generate && npm run migrate && npm run build`. `npm run migrate` applies each `migrations/*.up.sql` file once, in order, and records it in `schema_migrations`.
- Staging only: run `npm run seed` from `payflow-backend` with `DIRECT_URL` and `SEED_USER_PASSWORD` set. It loads `seed/seed.sql` and sets that password on every demo user. Production gets no demo users.

### Database workflows

- `db-backup.yml`: every night (20:00 UTC) it dumps the production database with `pg_dump` and keeps the file as a workflow artifact for 7 days. It needs the secret `NEON_BACKUP_URL`.
- `db-script.yml`: run it by hand from the Actions tab. Choose a file in `db/scripts` and the target (`staging` or `production`). The file runs in one transaction. It needs the secret `NEON_DIRECT_URL` in each GitHub environment, and production needs a reviewer to approve.

### Known limits

- The login rate limit (10 per minute) is kept in memory, so it resets on Vercel. The lockout after 5 failed logins is stored in the database and is not affected.
- `deploy-staging.yml` and `docker-compose.staging.yml` belong to the old SSH deployment. They are no longer used for staging.