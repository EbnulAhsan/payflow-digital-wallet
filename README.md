# PayFlow Digital Wallet & Transaction Management System

This repository contains the source code for the PayFlow Digital Wallet (Group 2) as specified in the SRS v0.1.

## Project Structure

- [Backend API Service (NestJS)](./payflow-backend/README.md)
- [Frontend Web Application (React)](./payflow-frontend/README.md)

Please check the respective README files in the folders above for detailed setup instructions.

## CI and staging deployment (NFR-OPS-01)

- Every pull request runs lint, unit tests, the API tests against PostgreSQL 16 and the frontend checks.
- When CI passes on `main`, the **Deploy to staging** workflow copies that commit to the staging server and starts `docker-compose.staging.yml` (Postgres, migrations, API, web). It must finish within 15 minutes.
- Until staging is configured, the workflow reports "not configured" and deploys nothing. To configure it, add these to the GitHub environment `staging`:
  - secrets `STAGING_HOST`, `STAGING_USER`, `STAGING_SSH_KEY`, `STAGING_KNOWN_HOSTS`
  - variable `STAGING_URL`
  - on the server, `/opt/payflow/staging.env` with `POSTGRES_ADMIN_PASSWORD`, `JWT_ACCESS_SECRET` (at least 32 bytes) and `CLIENT_URL`.
- The refresh cookie is `Secure`, so the staging server must serve the site over HTTPS (TLS in front of the `web` container, SRS 2).
