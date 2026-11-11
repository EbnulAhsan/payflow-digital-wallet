# WAL-06.2: Logout and refresh-token revocation

Implements the logout and session-refresh behavior in SRS FR-AUTH-03 on the
WAL-06.1 NestJS 10, TypeScript, and Prisma 5 authentication service.

## Contract

- `POST /api/v1/auth/refresh` rotates the seven-day refresh token and returns a
  new 15-minute access JWT. The refresh token is set only in an `HttpOnly`,
  `Secure`, `SameSite=Strict` cookie; only its SHA-256 hash is stored.
- A refresh token is single-use. The previous token is revoked as part of
  rotation; missing, expired, revoked, or inactive-account tokens return HTTP
  401.
- `POST /api/v1/auth/logout` revokes the presented refresh token and clears the
  cookie.
- Protected API requests verify the access JWT and the user's current account
  status. A deactivated account is refused immediately, and cannot refresh.

Errors use the existing problem-details response and include an `X-Request-Id`.

## Run locally

1. Start PostgreSQL and apply the existing WAL-04.1 schema:

   ```powershell
   docker compose -f ..\WAL-04.1\docker-compose.yml up -d postgres
   docker compose -f ..\WAL-04.1\docker-compose.yml --profile tools run --rm migrate
   ```

2. From this folder, install dependencies and configure environment values:

   ```powershell
   Copy-Item .env.example .env
   npm install
   ```

   Set `DATABASE_URL` to the `payflow_app` database connection and
   `JWT_ACCESS_SECRET` to a random secret of at least 32 bytes.

3. Generate the Prisma client and run the checks:

   ```powershell
   npm run prisma:generate
   npm run typecheck
   npm test
   npm run build
   ```

4. Start the API with `npm run start:dev`. It listens on port 3000 by default;
   Swagger UI is available at `/api/docs`. HTTPS must be terminated by the
   deployment proxy because the refresh cookie is always marked `Secure`.
