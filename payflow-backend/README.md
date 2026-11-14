# PayFlow Backend Service

[![CI](https://github.com/EbnulAhsan/payflow-digital-wallet/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/EbnulAhsan/payflow-digital-wallet/actions/workflows/ci.yml)

PayFlow v1.0 REST API service built with NestJS 10, TypeScript, and PostgreSQL 16.

## Prerequisites

- Node.js 20 LTS
- npm (v18+)
- PostgreSQL 16 (or Docker Compose)

## Quick local setup

1. Copy the example environment file and set `JWT_ACCESS_SECRET` to a random
   secret of at least 32 bytes:

   ```powershell
   Copy-Item .env.example .env
   ```

2. From `payflow-backend/`, start PostgreSQL and apply migrations:

   ```powershell
   docker compose up -d postgres
   docker compose --profile tools run --rm migrate up
   ```

   To verify migrations from an empty database, use a disposable local
   database. `docker compose down -v` removes the Compose database volume and
   all data stored in it.

3. Install dependencies, generate Prisma Client, and run checks:

   ```powershell
   npm install
   npm run prisma:generate
   npm test
   npm run test:e2e
   npm run build
   ```

4. Start the API:

   ```powershell
   npm run start:dev
   ```

The API listens on port 3000 by default. Swagger UI is available at
`/api/docs`. HTTPS must be terminated by the deployment proxy; refresh cookies
are always marked `Secure`.

## Authentication

### Register

`POST /api/v1/auth/register`

```json
{
  "fullName": "Rahim Uddin",
  "mobile": "01711000001",
  "email": "rahim@example.com",
  "password": "Str0ng!Pass",
  "role": "CUSTOMER"
}
```

Self-registration accepts `CUSTOMER` and `MERCHANT` roles only. Mobile and
email must be unique. A successful registration returns HTTP 201 and creates a
`PENDING` account. Passwords must be 8–64 characters, contain a letter and a
digit, and not match any of the top 10,000 common breached passwords. The
breached-password check uses a bundled offline dictionary. Invalid bodies
return HTTP 422 with field-specific errors; duplicate mobile and email return
HTTP 409 with `MOBILE_TAKEN` and `EMAIL_TAKEN`.

### Login

`POST /api/v1/auth/login`

```json
{
  "identifier": "01711000001",
  "password": "your-password"
}
```

`identifier` accepts a registered mobile number or email address. A successful
login requires an `ACTIVE` user and returns an HS256 access JWT valid for 15
minutes. The seven-day refresh token is returned only as an `HttpOnly`,
`Secure`, `SameSite=Strict` cookie; only its SHA-256 hash is stored in
`refresh_tokens`.

Unknown accounts and incorrect passwords both return HTTP 401 with code
`INVALID_CREDENTIALS` and detail `Invalid credentials`. Correct credentials
for an inactive account return HTTP 403 with code `ACCOUNT_NOT_ACTIVE`.
Five failed password checks in a rolling 15-minute window lock the account for
15 minutes. The next login attempt returns HTTP 429 with code
`TEMPORARILY_LOCKED` and a `Retry-After` header, even with the correct
password. A successful login clears the failed-login history. Login is also
limited to 10 attempts per minute per IP. Errors use RFC 9457-style problem
details and carry an `X-Request-Id`.

Run the authentication tests with:

```powershell
npm run test:auth
```

### Refresh and token expiry

Access tokens use HS256, expire after 15 minutes, and require a
`JWT_ACCESS_SECRET` of at least 32 bytes. Expired access tokens receive HTTP
401; clients can call `POST /api/v1/auth/refresh` to rotate the seven-day
refresh token and obtain a new access token.

Refresh tokens are stored only as SHA-256 hashes and sent only in an
`HttpOnly`, `Secure`, `SameSite=Strict` cookie. Reusing a rotated refresh token
revokes every active token in that session family. Missing, expired, revoked,
or inactive-account refresh tokens receive HTTP 401. `POST /api/v1/auth/logout`
revokes the presented refresh token and clears the cookie.

Migration `003_refresh_token_families` adds the session-family identifier to
existing refresh-token rows. Migration `004_failed_login_lockout` stores the
timestamps used to enforce the rolling failed-login window.

## Database seed

After applying migrations, load the demo data with:

```powershell
docker compose cp seed/seed.sql postgres:/tmp/seed.sql
docker compose exec -T postgres psql -U payflow_admin -d payflow_db -v ON_ERROR_STOP=1 -f /tmp/seed.sql
```

The seed is repeatable. Expected counts are 29 users, 30 wallets, 18
transactions, and 36 ledger entries.
