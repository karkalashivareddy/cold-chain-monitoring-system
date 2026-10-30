# FROSTGUARD

**Enterprise cold-chain intelligence, monitoring and traceability platform — _Every Degree Matters._**

FROSTGUARD is a multi-tenant reference implementation for temperature-controlled inventory, IoT telemetry, excursion response, shipment execution, analytics and audit evidence. It is a working TypeScript monorepo with a real MySQL persistence layer, not a static mock-up.

> **Project status:** demonstration/reference implementation. It is **not** a validated GxP system, does not carry a regulatory certification, and its risk scores are transparent operational heuristics rather than medical or regulatory safety determinations. Seeded telemetry is simulated and explicitly labelled. See [Limitations](#limitations-and-not-implemented-work).

---

## Contents

- [What is implemented](#what-is-implemented)
- [What is not implemented or not verified](#what-is-not-implemented-or-not-verified)
- [Architecture](#architecture)
- [Monorepo layout](#monorepo-layout)
- [Local setup with MySQL 8.0](#local-setup-with-mysql-80)
- [Docker Compose status](#docker-compose-status)
- [Environment variables](#environment-variables)
- [Database commands](#database-commands)
- [Demo accounts](#demo-accounts)
- [Running the applications](#running-the-applications)
- [Tests](#tests)
- [Security summary](#security-summary)
- [Simulation disclosure](#simulation-disclosure)
- [Limitations and not-implemented work](#limitations-and-not-implemented-work)
- [Documentation](#documentation)
- [License](#license)

---

## What is implemented

### Identity, tenancy and access control

- Multi-tenant organizations with database-backed roles and permissions.
- Six roles: `owner`, `admin`, `manager`, `operator`, `auditor`, `viewer`.
- Membership and role revalidated from MySQL on every authenticated REST request, so revocation takes effect without waiting for an access token to expire.
- Argon2id password hashing, opaque refresh tokens, refresh-token rotation, and revocation of the whole token family when a rotated token is replayed.
- httpOnly cookies for the browser flow, with a custom CSRF header required for cookie-authenticated state changes.
- Organization scoping on queries and cross-tenant checks on writes. Cross-tenant reads generally return `404` instead of disclosing that a record exists.

### Cold-chain operations

- Products, temperature profiles, suppliers, batches, warehouses and storage units.
- Batch traceability view and CSV evidence exports.
- Device provisioning, key rotation and revocation. Device API keys are stored as SHA-256 digests and shown once.
- Device-authenticated telemetry ingestion with optional HMAC payload signatures, timestamp sanity checks and `(sensorId, sequenceNumber)` idempotency.
- Temperature policy resolution using the narrowest applicable envelope across a shipment's batches.
- Persistence-based excursion detection, warning/critical severity, automatic alerts and automatic critical-incident creation.
- Alert acknowledgement and an incident workflow: `OPEN → ACKNOWLEDGED → INVESTIGATING → RESOLVED → CLOSED`, with notes, assignment, root cause, outcome and audit rows.
- Shipment planning, dispatch, position updates, delivery and cancellation.
- Concurrency-safe dispatch using a serializable transaction, row locking and the `sp_reserve_batch_stock` stored procedure.
- Transactional outbox events published to authenticated Socket.IO rooms per organization.
- Dashboards, risk analytics, warehouse/device/delivery analytics, expiring-batch views and CSV/PDF reports.
- An in-process telemetry simulator with `STABLE`, `DRIFT`, `EXCURSION`, `DISCONNECT`, `RECOVERY` and `MALFUNCTION` scenarios. Simulator readings are written through the same ingestion path and marked `isSimulated=true`.
- A DBMS inspection surface exposing schema inventory, views, triggers, routines, `EXPLAIN` plans and a verified rollback demonstration.

### Database engineering

- MySQL/InnoDB schema with 31 Prisma models, explicit decimal precision, UTC timestamps, foreign keys, unique constraints and indexes.
- Five reporting views, four integrity triggers, two stored procedures and nine `CHECK` constraints applied from `database/sql/`.
- Append-only telemetry enforced in the database by a trigger.
- Immutable-by-workflow audit rows written inside the same transaction as the business change. There is no database trigger preventing privileged direct updates to `audit_logs`; see [SECURITY.md](docs/SECURITY.md).

### Web application

- React 19 + Vite + Tailwind CSS 4 SPA.
- Permission-gated routes for dashboard, catalogue, inventory, facilities, devices, shipments, fleet map, incidents, alerts, analytics, audit, settings and DBMS inspection.
- In-memory access token with single-flight refresh against the httpOnly refresh cookie.
- React Query caches invalidated by Socket.IO events.
- Leaflet/OpenStreetMap fleet map. Basemap tiles are fetched from OpenStreetMap.
- Explicit **Simulated** badges wherever seeded or simulated telemetry is displayed.

The application is browser-first. `POST /api/v1/telemetry/readings` is the device-facing endpoint and uses a device API key rather than a user session.

---

## What is not implemented or not verified

These points are intentionally explicit:

- **No `docker-compose.yml` exists anywhere in this repository.** Docker/Compose usage is therefore not documented as a working workflow and was not runtime-verified.
- **No Docker runtime verification was performed** for this documentation, including the MySQL 8.4 image mentioned in the Prisma schema header.
- **No OpenAPI/Swagger document and no `/api/v1/docs` route exist**, even though `GET /api/v1` advertises `"documentation": "/api/v1/docs"`.
- **No password-reset, change-password, email-verification or MFA flow.**
- **No email/SMS/push delivery.** `notification_logs` rows are in-app records only.
- **No external object storage or document upload.** CSV/PDF reports are generated on demand.
- **No container or infrastructure security scanning** is configured. GitHub Actions runs a lockfile-based npm advisory classifier; run 41098761499 on commit 4237f09 passed the configured workflow.
- **No external penetration test, threat-model validation or compliance audit** is evidenced.
- **A Playwright public landing smoke test is present** and has passed in Vite dev and production preview. Authenticated end-to-end workflows remain incomplete.
- **A GitHub Actions CI workflow is present** with MySQL, migration/SQL, browser smoke, lint, typecheck, build, tests and dependency classification; remote run 41098761499 passed on commit 4237f09.
- **No production deployment, reverse-proxy, TLS or backup configuration** is included.
- The public landing page and 14 authenticated routes were exercised with Playwright; landing/dashboard screenshots were inspected at desktop and mobile sizes. Broader end-to-end business workflows and accessibility audits remain incomplete.
- Production use would require validation, monitoring, backup/restore, retention, secret management and regulatory review. None of those are claimed here.

---

## Architecture

```text
                          ┌──────────────────────────────┐
                          │  React 19 SPA (Vite)         │
                          │  Tailwind 4 · React Query    │
                          │  permission-gated routes     │
                          └──────────────┬───────────────┘
                                         │ HTTPS
                       /api/v1 JSON      │      Socket.IO (/socket.io)
                       cookies/bearer    │      authenticated org rooms
                                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Express 5 API                                                          │
│                                                                        │
│  Helmet · CORS allowlist · request ID · CSRF guard · rate limits       │
│  JSON validation (Zod) · error envelope · BigInt-safe serialization    │
│                                                                        │
│  auth / RBAC ──► module routes ──► services ──► Prisma + mysql2        │
│                         │              │                               │
│                         │              ├─► audit rows (same TX)        │
│                         │              └─► outbox rows (same TX)       │
│                         │                                              │
│  device key + optional HMAC ──► telemetry ingestion                    │
│  outbox worker ──► Socket.IO publisher                                 │
└──────────────────────────────┬─────────────────────────────────────────┘
                               │ SQL (Prisma + selected raw/stored routines)
                               ▼
┌────────────────────────────────────────────────────────────────────────┐
│ MySQL 8.x / InnoDB                                                     │
│ 31 tables · 5 views · 4 triggers · 2 procedures · 9 CHECK constraints  │
│ unique/idempotency keys · explicit indexes · UTC timestamps            │
└────────────────────────────────────────────────────────────────────────┘

External: OpenStreetMap raster tiles used by the fleet map.
Seed dataset / simulator ──► same telemetry ingestion path ──► isSimulated=true
```

Key architectural rules:

1. **MySQL is the source of truth.** The API does not keep authoritative business state in memory.
2. **Authorization is re-derived per request.** JWT claims identify the user and organization, but permissions come from the current membership/role rows.
3. **Business change, audit row and outbox event commit together.** Realtime publication happens only after commit through the outbox worker.
4. **Telemetry is append-only at the database layer.** Historical readings cannot be updated.
5. **Stock reservation is transactional.** Dispatch locks the shipment, then calls a stored procedure that locks and conditionally decrements each batch.
6. **Simulation is never disguised as physical telemetry.** Seed and simulator rows carry `isSimulated=true` and are labelled in the UI.

Full details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Monorepo layout

```text
cold-chain-monitoring-system/
├── apps/
│   ├── api/                       Express 5 API
│   │   ├── prisma/
│   │   │   ├── schema.prisma      MySQL schema (31 models)
│   │   │   ├── migrations/        Initial Prisma migration
│   │   │   ├── seed.ts            Deterministic demo dataset
│   │   │   └── apply-sql.ts       Applies database/sql/*.sql
│   │   ├── src/
│   │   │   ├── config/            Environment validation
│   │   │   ├── lib/               HTTP envelopes, errors, Prisma, SQL helpers
│   │   │   ├── middleware/        Auth, CSRF, rate limits, validation, errors
│   │   │   ├── modules/           Domain routers and services
│   │   │   ├── realtime/          Socket.IO authentication and org rooms
│   │   │   ├── security/          Password, token and device-key primitives
│   │   │   ├── services/          Audit and transactional outbox
│   │   │   ├── app.ts             Express composition
│   │   │   └── server.ts          HTTP server, Socket.IO, workers, shutdown
│   │   └── tests/                 Vitest + Supertest integration tests
│   └── web/                       React 19 + Vite SPA
│       └── src/
│           ├── components/        UI, charts, layout, map, catalogue dialogs
│           ├── lib/               API client, auth, React Query, realtime
│           └── pages/             Application screens
├── packages/
│   └── shared/                    Zod schemas, roles, permissions, enums
├── database/
│   └── sql/                       Views, triggers, procedures, constraints
├── .env.example                   Development environment template
├── package.json                   npm workspaces and root scripts
└── tsconfig.base.json
```

There is no committed container definition, infrastructure-as-code directory or deployment manifest. A CI workflow exists, and remote GitHub Actions run 41098761499 passed.

---

## Local setup with MySQL 8.0

### Prerequisites

- Node.js **>= 20.19** (declared in `package.json`).
- npm (workspaces are used).
- A local MySQL server. The documented local target is **MySQL 8.0**; the Prisma schema header names **MySQL 8.4 LTS** as its design target. The SQL avoids features that require 8.4, but this repository does not include a verified Compose or 8.4 runtime setup.

### 1. Create the database and development user

Example for a local MySQL 8.0 installation:

```sql
CREATE DATABASE frostguard
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER 'frostguard'@'localhost'
  IDENTIFIED BY 'frostguard_dev_password';

GRANT ALL PRIVILEGES ON frostguard.* TO 'frostguard'@'localhost';
FLUSH PRIVILEGES;
```

You can instead use an existing privileged account and change `DATABASE_URL` accordingly. Development credentials are examples only; never reuse them in a shared environment.

### 2. Install dependencies

```bash
npm install
```

### 3. Configure the API environment

The API loads `apps/api/.env` first, then the repository-root `.env`. The simplest local setup is:

```bash
cp .env.example apps/api/.env
```

On PowerShell:

```powershell
Copy-Item .env.example apps/api/.env
```

Generate strong secrets and replace the development placeholders:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

At minimum, replace `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `DEVICE_HMAC_SECRET` and the database password. Note that refresh tokens are opaque random values, not JWTs, so `JWT_REFRESH_SECRET` is currently required by environment validation but is not used to sign tokens.

### 4. Generate the Prisma client and set up the schema

```bash
npm run db:generate
npm run db:setup
```

`db:setup` runs, in order:

1. `prisma migrate dev` — applies the committed initial migration.
2. `db:sql` — applies views, triggers, procedures, check constraints and extra indexes from `database/sql/`.
3. `db:seed` — creates roles, permissions and the demo tenants/data.

Prisma's prepared-statement protocol cannot run some DDL such as `DROP TRIGGER`, which is why the SQL layer is applied separately through `mysql2`.

### 5. Start the development servers

```bash
npm run dev
```

This builds `@frostguard/shared`, then starts:

- API: <http://localhost:4000>
- Web: <http://localhost:5173>

Health endpoints:

```text
GET http://localhost:4000/health/live
GET http://localhost:4000/health/ready
```

The readiness check executes a real database query and counts pending outbox events and active incidents.

The root route `/` of the SPA is currently an empty landing shell. Open <http://localhost:5173/login> directly.

---

## Docker Compose status

**Not implemented in this repository.**

A search of the repository finds **no `docker-compose.yml` or equivalent Compose file**. `.env.example` contains a comment describing a hypothetical Compose host named `mysql`, but no service definition is committed. No Docker-based setup is documented here because it could not be verified.

The Prisma schema header mentions MySQL 8.4 LTS; that is a schema target, not evidence that a Docker/MySQL 8.4 runtime was exercised.

If you add Compose later, treat it as new infrastructure: pin image versions, keep the database volume out of Git, inject secrets rather than hard-coding them, wait for MySQL readiness before migrations, and document the tested path.

---

## Environment variables

`apps/api/src/config/env.ts` validates configuration at boot and exits if required values are missing or invalid.

| Variable | Required | Default / example | Purpose |
| --- | --- | --- | --- |
| `NODE_ENV` | No | `development` | `development`, `test` or `production`. Production enables secure cookies. |
| `API_PORT` | No | `4000` | HTTP listen port. |
| `API_ORIGIN` | No | `http://localhost:4000` | API origin setting. |
| `WEB_ORIGIN` | No | `http://localhost:5173` | CORS allowlist; a comma-separated list is split into multiple origins. |
| `DATABASE_URL` | **Yes** | `mysql://frostguard:...@localhost:3306/frostguard` | MySQL connection string used by Prisma and the SQL applier. |
| `JWT_ACCESS_SECRET` | **Yes** | development placeholder | HS256 access-token signing secret; minimum 32 characters. |
| `JWT_REFRESH_SECRET` | **Yes** | development placeholder | Validated and required, but refresh tokens are opaque and this value is not currently used for signing. |
| `ACCESS_TOKEN_TTL_SECONDS` | No | `900` | Access-token lifetime; minimum 60 seconds. |
| `REFRESH_TOKEN_TTL_DAYS` | No | `14` | Refresh-token lifetime in days. |
| `DEVICE_HMAC_SECRET` | No | development placeholder | Shared secret for optional telemetry HMAC signatures; minimum 32 characters. |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Global rate-limit window. |
| `RATE_LIMIT_MAX` | No | `300` | Global requests per window. |
| `LOGIN_RATE_LIMIT_MAX` | No | `10` | Failed login attempts per 15-minute window, keyed by IP + email. |
| `LOG_LEVEL` | No | `info` | Pino log level. |
| `SEED_DEMO_PASSWORD` | No | `Frostguard#2026` | Password assigned to all seeded demo users. Development only. |

Limits are skipped when `NODE_ENV=test`. Telemetry ingestion has its own fixed limiter of 600 requests per minute, keyed by device key (falling back to IP).

---

## Database commands

Run these from the repository root.

| Command | What it does |
| --- | --- |
| `npm run db:generate` | Generates the Prisma client from `apps/api/prisma/schema.prisma`. |
| `npm run db:migrate` | Runs `prisma migrate dev` using `apps/api` configuration. |
| `npm run db:sql` | Applies `database/sql/*.sql` in filename order via `apps/api/prisma/apply-sql.ts`. |
| `npm run db:seed` | Runs the deterministic seed (`apps/api/prisma/seed.ts`). |
| `npm run db:reset` | **Destructive:** `prisma migrate reset --force` for the configured database. |
| `npm run db:setup` | `db:migrate` → `db:sql` → `db:seed`. |
| `cd apps/api && npm run db:deploy` | Applies committed migrations in a non-interactive deployment context (API workspace script; no root alias). |

There is one committed Prisma migration: `20261030124615_init`. Database objects in `database/sql/` are deliberately applied after migrations. The re-runnable SQL applier ignores duplicate-object errors such as an already-existing index or check constraint.

---

## Demo accounts

The seed creates two organizations and deterministic demo users. All seeded users share the password from `SEED_DEMO_PASSWORD`, which defaults to:

```text
Frostguard#2026
```

| Organization | Slug | Email | Role |
| --- | --- | --- | --- |
| Northline Biologics | `northline` | `owner@northline.demo` | `owner` |
| Northline Biologics | `northline` | `manager@northline.demo` | `manager` |
| Northline Biologics | `northline` | `operator@northline.demo` | `operator` |
| Northline Biologics | `northline` | `auditor@northline.demo` | `auditor` |
| Northline Biologics | `northline` | `viewer@northline.demo` | `viewer` |
| Meridian Cold Logistics | `meridian` | `owner@meridian.demo` | `owner` |

Recommended demo login:

```text
Email:    owner@northline.demo
Password: Frostguard#2026
Org slug: northline
```

The seed also creates demo devices with predictable development-only keys of the form `fgd_demo_<deviceid>_2026`. The plaintext keys are printed to the seed console only; only SHA-256 digests are stored. These credentials must never be used outside a local demo.

Re-running the seed deletes and recreates the `northline` and `meridian` tenants, users and their dependent demo data.

---

## Running the applications

| Command | Purpose |
| --- | --- |
| `npm run dev` | Build shared package, then run API and web concurrently. |
| `npm run dev:api` | API only (`tsx watch src/server.ts`). |
| `npm run dev:web` | Vite dev server only. |
| `npm run build` | Build shared, API and web. |
| `npm run typecheck` | Build shared, then typecheck API and web. |
| `npm run lint` | ESLint across the repository. |
| `npm start -w @frostguard/api` | Start the compiled API from `apps/api/dist/server.js` after a build. |

In production, if `apps/web/dist/index.html` exists, the API serves the built SPA from the same origin and falls back to `index.html` for non-API GET routes. No production deployment configuration is committed.

---

## Tests

```bash
npm test
```

The API test suite uses Vitest and Supertest and exercises the real HTTP surface, real Prisma queries and the real MySQL triggers/procedures.

**Status: 56/56 API/MySQL tests passed** on 2026-10-30 against the dedicated `frostguard_test` schema using Vitest 4.1.12. Typecheck, lint, production build and all 3 Playwright Chromium tests passed. Coverage includes tenant isolation, injected transaction rollback, outbox/realtime authorization and the authenticated route smoke. Exact limitations and command results: `docs/audit/RELEASE_CANDIDATE_REPORT.md`.

On the audit Windows host, the default `tsx` runner initially failed before Vitest startup with Node `uv_os_get_passwd returned ENOMEM`. The same `npm.cmd test` suite was then executed successfully using a temporary process-only Node preload workaround; the preload was removed afterward. This host-specific issue is documented and does not change project source or test configuration.

The suite's global setup:

1. Connects to MySQL at `mysql://root:root@localhost:3306/frostguard_test`.
2. Creates the `frostguard_test` database if needed.
3. Runs `prisma db push --force-reset` (not migrations).
4. Applies `database/sql/*.sql`.
5. Runs the seed.

Therefore the tests require a reachable local MySQL with those root credentials, or a modified `apps/api/vitest.config.mts` / `tests/globalSetup.ts`. The test database is disposable and is reset. Do not point it at a database you care about.

Playwright specs are in `apps/web/e2e/`. On Windows, start the web dev server before `npm run test:e2e`; authenticated tests also require the compiled API on port 4000 connected to seeded `frostguard_test`. CI seeds that disposable database first and starts the compiled API before the browser suite. The full route smoke checks 14 application routes, detail/empty states and mobile keyboard focus. It is not a WCAG conformance or production deployment claim.

---

## Security summary

Implemented controls include:

- Argon2id password hashing with 19 MiB memory, 2 iterations and 1 lane.
- HS256 access JWTs with issuer/audience checks and a 15-minute default TTL.
- Opaque refresh tokens stored only as SHA-256 hashes; rotation and token-family revocation on reuse.
- httpOnly, `SameSite=Lax` cookies; `Secure` in production.
- Custom CSRF header for cookie-authenticated state-changing requests.
- Helmet security headers with a restrictive CSP for the API/SPA, plus a CORS allowlist.
- Global, login and telemetry rate limits.
- Zod request validation on write endpoints and documented query parameters.
- Database-derived RBAC and organization scoping on every protected request.
- Device API keys hashed with SHA-256, constant-time comparison, rotation/revocation, and optional HMAC telemetry signatures.
- Security-relevant audit rows written in the business transaction.
- Uniform authentication errors and dummy password verification to reduce account enumeration.
- Append-only telemetry enforced by a MySQL trigger.

Not claimed: external penetration testing, formal threat-model review, compliance certification, MFA, password reset, encryption at rest/TDE configuration, secret-manager integration, dependency scanning, WAF or production hardening.

See [docs/SECURITY.md](docs/SECURITY.md) and [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md).

---

## Simulation disclosure

- The seed dataset writes sensor readings with `isSimulated=true` and `source="SEED"`.
- The built-in simulator writes through the authenticated ingestion service with `isSimulated=true` and `source="SIMULATOR"`.
- The API returns the simulation flag with readings, latest telemetry, shipment maps and telemetry series counts.
- The web application renders a **Simulated** badge in the dashboard, devices, batch, shipment, map and settings views.
- The simulator is an in-process `setInterval` loop. It does not model sensor physics, calibration, battery behaviour or network protocols, and it is not a validation or qualification tool.
- Simulated readings are never described as physical sensor truth.

---

## Limitations and not-implemented work

- No Docker Compose file and no verified container runtime.
- No `/api/v1/docs` implementation despite the API root advertising it.
- No OpenAPI schema or generated client.
- No MFA, password reset, change-password, email verification or SSO.
- No outbound email/SMS/push provider.
- CI workflow includes lockfile dependency advisory classification, but has not been verified remotely. No container scanning or SAST configuration.
- No evidence of an external penetration test or formal security review.
- Playwright public-page smoke exists; authenticated E2E and full responsive/accessibility automation remain incomplete.
- No production deployment manifests, TLS termination, secret manager, backup/restore automation or retention jobs.
- No file/object uploads.
- Audit logs are written transactionally and exposed read-only through the API, but the table itself is not protected against direct privileged updates by a trigger.
- Socket.IO fan-out and simulator timers are process-local. Multi-instance deployments would need a shared adapter/queue and coordination.
- The outbox worker runs inside the API process; it is not a separate durable worker service.
- No rate-limit store is configured, so counters are process-local by default.
- The seeded device keys are predictable and development-only.
- Report queries are bounded (for example, temperature CSV caps at 50,000 rows; telemetry series ranges cap at 90 days), but there is no asynchronous large-report pipeline.
- Data retention and legal hold are not implemented.
- Risk scoring is a rule-based heuristic and has not been clinically or regulatorily validated.
- The public landing page and authenticated dashboard have desktop/mobile Playwright screenshots; other authenticated product workflows have not yet been visually audited end-to-end.
- `JWT_REFRESH_SECRET` is required but unused because refresh tokens are opaque.
- Local MySQL 8.0 setup is documented; MySQL 8.4/Docker runtime compatibility is not verified.

---

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Database design](docs/DATABASE.md)
- [Security controls](docs/SECURITY.md)
- [Threat model](docs/THREAT-MODEL.md)
- [API reference](docs/API.md)
- [Research notes and design rationale](docs/RESEARCH.md)

---

## License

**UNLICENSED.** This repository is private and no license is granted for redistribution or commercial use. See the root `package.json` (`"license": "UNLICENSED"`).
