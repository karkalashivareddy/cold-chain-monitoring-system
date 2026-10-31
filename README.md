# FROSTGUARD

**Cold-chain intelligence, monitoring and traceability — _Every Degree. Every Handoff. Accounted For._**

FROSTGUARD is a multi-tenant reference implementation for temperature-controlled inventory, IoT telemetry, excursion response, shipment execution, analytics and audit evidence. It is a working TypeScript monorepo with a real MySQL persistence layer, not a static mock-up.

> **Project status:** demonstration/reference implementation. It is **not** a validated GxP system, does not carry a regulatory certification, and its risk scores are transparent operational heuristics rather than medical or regulatory safety determinations. Seeded telemetry is simulated and explicitly labelled. See [Limitations](#limitations-and-not-implemented-work).

---

## Contents

- [What is implemented](#what-is-implemented)
- [What is not implemented or not verified](#what-is-not-implemented-or-not-verified)
- [Architecture](#architecture)
- [Monorepo layout](#monorepo-layout)
- [Local setup with MySQL 8.4](#local-setup-with-mysql-84)
- [Docker Compose local deployment](#docker-compose-local-deployment)
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
- Device-authenticated telemetry ingestion with optional HMAC payload signatures, timestamp sanity checks and `(sensorId, bootId, sequenceNumber)` idempotency (device counters may safely restart after a reboot).
- Temperature policy resolution using the narrowest applicable envelope across a shipment's batches.
- Persistence-based excursion detection, warning/critical severity, automatic alerts and automatic critical-incident creation.
- Alert acknowledgement and an incident workflow: `OPEN → ACKNOWLEDGED → INVESTIGATING → RESOLVED → CLOSED`, with notes, assignment, root cause, outcome and audit rows.
- Shipment planning, dispatch, position updates, delivery and cancellation.
- Explicit shipment position provenance (`UNAVAILABLE`, `SIMULATED`, `OPERATOR_REPORTED`, `DELIVERY_CONFIRMED`) and last-update timestamp; warehouse origin and delivery confirmation are not treated as current GPS.
- Concurrency-safe dispatch using a serializable transaction, row locking and the `sp_reserve_batch_stock` stored procedure.
- Transactional outbox events published to authenticated Socket.IO rooms per organization.
- Dashboards, risk analytics, warehouse/device/delivery analytics, expiring-batch views and CSV/PDF reports.
- An in-process telemetry simulator with `STABLE`, `DRIFT`, `EXCURSION`, `DISCONNECT`, `RECOVERY` and `MALFUNCTION` scenarios. Simulator readings are written through the same ingestion path and marked `isSimulated=true`.
- A DBMS inspection surface exposing schema inventory, views, triggers, routines, `EXPLAIN` plans and a verified rollback demonstration.

### Database engineering

- MySQL/InnoDB schema with 31 Prisma models, explicit decimal precision, UTC timestamps, foreign keys, unique constraints and indexes.
- Five reporting views, six integrity triggers, two stored procedures and nine `CHECK` constraints applied from `database/sql/`.
- Append-only telemetry enforced in the database by a trigger.
- Audit rows are written in the business transaction; database triggers reject direct row updates and deletes. Organization cascades still bypass child delete triggers, and a database owner can alter triggers; see [security controls](docs/security/SECURITY_CONTROLS.md).

### Web application

- React 19 + Vite + Tailwind CSS 4 SPA.
- Permission-gated routes for dashboard, catalogue, inventory, facilities, devices, shipments, fleet map, incidents, alerts, analytics, audit, settings and DBMS inspection.
- In-memory access token with single-flight refresh against the httpOnly refresh cookie.
- React Query caches invalidated by Socket.IO events.
- Leaflet/OpenStreetMap fleet map. It draws only source-backed vehicle positions; direct endpoint connections are labeled as geographic lines, not road routes. OpenStreetMap raster tiles are a development/demo default, require attribution, and do not provide a production SLA.
- Explicit **Simulated** badges wherever seeded or simulated telemetry is displayed.

The application is browser-first. `POST /api/v1/telemetry/readings` is the device-facing endpoint and uses a device API key rather than a user session.

---

## What is not implemented or not verified

These points are intentionally explicit:

- Dockerfiles, Compose and Nginx definitions are present. Compose syntax was checked, but image builds/startup are **not runtime-verified** because the Docker Engine is unavailable on the current host; see [local deployment guide](docs/deployment/DOCKER_LOCAL.md).
- **OpenAPI 3.1 is served at `/api/v1/openapi.json`**, with a same-origin API documentation page at `/api/v1/docs`. It documents the mounted API route inventory; request/response schemas remain intentionally generic for some operations.
- **No password-reset, change-password, email-verification or MFA flow.**
- **No email/SMS/push delivery.** `notification_logs` rows are in-app records only.
- **No external object storage or document upload.** CSV/PDF reports are generated on demand.
- **No container or infrastructure security scanning** is configured. GitHub Actions runs a lockfile-based npm advisory classifier; inspect the [workflow history](https://github.com/karkalashivareddy/cold-chain-monitoring-system/actions/workflows/ci.yml) for the latest remote result. Three high Prisma/deepmerge-ts findings remain.
- **No external penetration test, threat-model validation or compliance audit** is evidenced.
- **Playwright coverage includes the public landing page, a seeded live dashboard, and authenticated route smoke across 14 operational routes.** The route smoke does not cover every control or full business workflow.
- **A GitHub Actions CI workflow is present** with MySQL, migration/SQL, browser smoke, lint, typecheck, build, tests and dependency-advisory classification. The workflow classifies known advisories; that does not mean the three high Prisma/deepmerge-ts findings are resolved. Check the linked workflow history for the latest run on the repository's current main revision.
- **No production deployment, TLS termination, or executed backup/restore drill** is evidenced. Local Nginx proxy and backup instructions are documented; container runtime remains unverified.
- Public landing, dashboard, 14 authenticated routes and product workflow have Playwright evidence. Fleet-map tests cover provenance, filters, selection, tile-failure disclosure and mobile overflow; see the release execution log for scope. Captured screens are listed in the screenshot gallery below.
- Production use would require validation, monitoring, backup/restore, retention, secret management and regulatory review. None of those are claimed here.

---

## Product screenshots

Captured from the local app against the seeded demo tenant. Seeded readings and positions are simulated; screenshots show the interface and local test data, not a hosted service or physical telemetry. [Open the full screenshot gallery](docs/audit/screenshots/README.md) for the landing page, operational dashboard, fleet map and responsive views.

![FROSTGUARD operational dashboard, captured at a 1366 × 768 browser viewport against the seeded demo tenant](docs/audit/screenshots/release-candidate-20261031-final/dashboard-desktop-1366x768.png)

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
│ MySQL 8.4 LTS / InnoDB                                                 │
│ 31 tables · 5 views · 6 triggers · 2 procedures · 9 CHECK constraints  │
│ unique/idempotency keys · explicit indexes · UTC timestamps            │
└────────────────────────────────────────────────────────────────────────┘

External: OpenStreetMap standard raster tiles for local/demo map context; see [provider limitations](docs/audit/MAP_ENGINEERING_DECISION.md).
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

The repository includes API and web multi-stage Dockerfiles, an internal-only MySQL network, a persistent database volume, a one-shot migration/SQL service, health checks and an Nginx SPA/API/WebSocket proxy. This is a deployment definition, not a verified running deployment. Check the current result in [GitHub Actions](https://github.com/karkalashivareddy/cold-chain-monitoring-system/actions/workflows/ci.yml).

---

## Local setup with MySQL 8.4

### Prerequisites

- Node.js **>= 20.19** (declared in `package.json`).
- npm (workspaces are used).
- A local MySQL server. The supported and CI target is **MySQL 8.4 LTS**. Compose and CI both specify `mysql:8.4`; Docker runtime verification is still pending on the current host.

### 1. Create the database and development user

Example for a local MySQL 8.4 installation:

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

At minimum, replace `JWT_ACCESS_SECRET`, `DEVICE_HMAC_SECRET` and the database password. Refresh tokens are opaque random values whose hashes are stored in MySQL; each refresh-token family remains bound to the organization selected at login.

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

The root route `/` is the public product landing page; use its console button or open <http://localhost:5173/login> directly.

---

## Docker Compose local deployment

The Compose definition is for a **local, disposable installation**; it is not evidence of a hosted production deployment. Docker Engine and Compose are required. The Compose file uses MySQL 8.4, a persistent named database volume, a private internal network, a one-shot migration service, health checks and a web proxy. MySQL is not published to the host, and the web service binds to loopback by default. The current host has no Docker Engine, so image builds and startup have not been verified.

```powershell
Copy-Item .env.compose.example .env.compose
docker compose --env-file .env.compose config
docker compose --env-file .env.compose up --build -d
docker compose --env-file .env.compose run --rm migrate npm run db:seed -w @frostguard/api
```

Open <http://localhost:8080> and sign in with `owner@northline.demo` and `SEED_DEMO_PASSWORD` from `.env.compose` (the local example uses `Frostguard#2026`). The seed creates synthetic demo data and predictable device credentials. It deletes/recreates its two demo tenants; use it only with a fresh, disposable local database. Never run the seed in production.

Stop without deleting data with `docker compose --env-file .env.compose down`. The database volume persists. `docker compose down -v` deletes it and is destructive. The API runs as one process because Socket.IO fan-out, the simulator and the outbox worker are process-local.

For production, use `NODE_ENV=production`, unique high-entropy secrets from a secret manager, an HTTPS public origin, TLS at a trusted reverse proxy and a controlled migration step. Restrict access to the loopback-bound web port. This Compose stack does not configure TLS, managed secrets, backups, cloud network policy, monitoring or restore automation and has not been runtime verified.

---

## Environment variables

`apps/api/src/config/env.ts` validates configuration at boot and exits if required values are missing or invalid.

| Variable | Required | Default / example | Purpose |
| --- | --- | --- | --- |
| `NODE_ENV` | No | `production` when unset | `development`, `test` or `production`. Set `development` explicitly for local work. Production enables secure cookies and rejects placeholder secrets. |
| `API_PORT` | No | `4000` | HTTP listen port. |
| `API_ORIGIN` | No | `http://localhost:4000` | API origin setting. |
| `WEB_ORIGIN` | No | `http://localhost:5173` | CORS allowlist; a comma-separated list is split into multiple origins. |
| `DATABASE_URL` | **Yes** | `mysql://frostguard:...@localhost:3306/frostguard` | MySQL connection string used by Prisma and the SQL applier. |
| `JWT_ACCESS_SECRET` | **Yes** | development placeholder | HS256 access-token signing secret; minimum 32 characters. |
| `ACCESS_TOKEN_TTL_SECONDS` | No | `900` | Access-token lifetime; minimum 60 seconds. |
| `REFRESH_TOKEN_TTL_DAYS` | No | `14` | Refresh-token lifetime in days. |
| `DEVICE_HMAC_SECRET` | No | development placeholder | Shared secret for optional telemetry HMAC signatures; minimum 32 characters. |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Global rate-limit window. |
| `RATE_LIMIT_MAX` | No | `300` | Global requests per window. |
| `LOGIN_RATE_LIMIT_MAX` | No | `10` | Failed login attempts per 15-minute window, keyed by IP + email. |
| `LOG_LEVEL` | No | `info` | Pino log level. |
| `SEED_DEMO_PASSWORD` | No | `Frostguard#2026` | Password assigned to all seeded demo users. Development only. |

Limits are skipped when `NODE_ENV=test`. Telemetry ingestion has its own fixed limiter of 600 requests per minute, keyed by the client IP because it runs before device authentication. Rate-limit state is process-local; use one API process unless a shared store is configured.

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

The seed also creates demo devices with predictable development-only keys of the form `fgd_demo_<deviceid>_2026`. Only SHA-256 digests are stored, and key material is not printed by the seed command. These credentials must never be used outside a local demo.

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

**Local verification for the current working revision (2026-10-31):** Typecheck, lint, production build, API/MySQL suite (13 files / 74 tests), Playwright suite (5 tests), clean five-migration deployment, and SQL control application passed. Database tests use disposable `_test` databases on loopback; browser tests use the local API and seeded demo organization. This working revision still requires remote CI after push. Three high Prisma/deepmerge-ts dependency findings remain; Docker Engine runtime, production map tiles, independent security assessment and hosted deployment remain unverified. See the [security test results](docs/security/SECURITY_TEST_RESULTS.md), [release candidate report](docs/audit/RELEASE_CANDIDATE_REPORT.md), and [release execution log](docs/audit/RELEASE_EXECUTION_LOG.md) for prior scope/evidence.

On the audit Windows host, the default `tsx` runner initially failed before Vitest startup with Node `uv_os_get_passwd returned ENOMEM`. The same `npm.cmd test` suite was then executed successfully using a temporary process-only Node preload workaround; the preload was removed afterward. This host-specific issue is documented and does not change project source or test configuration.

The suite's global setup:

1. Connects to MySQL at `mysql://root:root@localhost:3306/frostguard_test`.
2. Creates the `frostguard_test` database if needed.
3. Runs `prisma db push --force-reset` (not migrations).
4. Applies `database/sql/*.sql`.
5. Runs the seed.

Therefore the tests require a reachable local MySQL with those root credentials, or a modified `apps/api/vitest.config.mts` / `tests/globalSetup.ts`. The test database is disposable and is reset. Do not point it at a database you care about.

Playwright specs are in `apps/web/e2e/`. On Windows, start the web dev server before `npm run test:e2e`; authenticated tests also require the compiled API on port 4000 connected to seeded `frostguard_test`. CI seeds that disposable database first and starts the compiled API before the browser suite. The suite checks 14 operational routes, available detail/empty states, keyboard focus, and axe-core serious/critical findings for landing at 375x812, 390x844, 768x1024, 1366x768 and 1920x1080; all operational routes at desktop; dashboard at those five viewports; and products at 390x844. This is automated evidence, not a WCAG conformance claim or a screen-reader review.

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

Not claimed: external penetration testing, formal threat-model review, compliance certification, MFA, password reset, encryption at rest/TDE configuration, secret-manager integration, WAF or production hardening. `npm audit` still reports three high findings in the Prisma/deepmerge-ts chain, including with `--omit=dev`; see the dated assessment and release report.

See [security controls](docs/security/SECURITY_CONTROLS.md) and the [threat model](docs/security/THREAT_MODEL.md).

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

- Dockerfiles and Compose definition exist; container build/startup remains unverified because the current host lacks a Docker Engine.
- OpenAPI schema and `/api/v1/docs` route are implemented; there is no generated API client.
- No MFA, password reset, change-password, email verification or SSO.
- No outbound email/SMS/push provider.
- Current remote CI status is available in the [GitHub Actions workflow history](https://github.com/karkalashivareddy/cold-chain-monitoring-system/actions/workflows/ci.yml); three high dependency advisories remain, and no container scanning or SAST configuration is present.
- No evidence of an external penetration test or formal security review.
- Playwright covers landing, dashboard and 14 authenticated routes, plus a live product workflow; axe-core checks serious/critical findings for the documented route and viewport scope. Lower-impact findings, broader workflows and screen-reader review remain.
- No hosted production deployment, TLS termination configuration, secret manager, backup/restore automation or retention jobs.
- No file/object uploads.
- Audit logs are written transactionally and exposed read-only through the API, but the table itself is not protected against direct privileged updates by a trigger.
- Socket.IO fan-out and simulator timers are process-local. Multi-instance deployments would need a shared adapter/queue and coordination.
- The outbox worker runs inside the API process; it is not a separate durable worker service.
- No rate-limit store is configured, so counters are process-local by default.
- The seeded device keys are predictable and development-only.
- Report queries are bounded (for example, temperature CSV caps at 50,000 rows; telemetry series ranges cap at 90 days), but there is no asynchronous large-report pipeline.
- Data retention and legal hold are not implemented.
- Risk scoring is a rule-based heuristic and has not been clinically or regulatorily validated.
- Landing, dashboard, fleet map, products, shipment detail, incidents and analytics have captured screenshots in the [gallery](docs/audit/screenshots/README.md). Automated route checks and screenshots do not establish full WCAG conformance or cover every workflow at every viewport.
- Local MySQL setup and CI migration checks are documented. Compose syntax parses, but MySQL 8.4/container runtime compatibility remains unverified because the local Docker Engine is unavailable.

---

## Creator

FROSTGUARD is an independently developed student software engineering project by **Karkala Shiva Reddy**, pursuing a **B.Tech in Computer Science and Engineering at KL University** (expected graduation: 2029). The project demonstrates full-stack development, tenant-aware authorization, MySQL transaction design, telemetry workflows, testing and operational UI design. It is a learning and reference project, not a deployed commercial service.

- [GitHub](https://github.com/karkalashivareddy)
- [LinkedIn](https://linkedin.com/in/shiva-reddy-karkala-1a66b4397/)
- [Portfolio](https://portfolio-shiva-c677.vercel.app)

## Documentation

- [Architecture](docs/architecture/ARCHITECTURE.md)
- [Database design](docs/DATABASE.md)
- [Security controls](docs/security/SECURITY_CONTROLS.md)
- [Threat model](docs/security/THREAT_MODEL.md)
- [API documentation page](http://localhost:4000/api/v1/docs) (after starting the API)
- [OpenAPI 3.1 JSON](http://localhost:4000/api/v1/openapi.json) (after starting the API)
- [Research notes and design rationale](docs/research/DOMAIN_RESEARCH.md)
- [Documentation index](docs/README.md)
- [Current product reassessment and release execution](docs/audit/FULL_PRODUCT_REASSESSMENT.md)
- [Map engineering decision](docs/audit/MAP_ENGINEERING_DECISION.md)

---

## License

FROSTGUARD project-owned code and documentation are released under the [MIT License](LICENSE). Third-party packages retain their own licenses; the legacy JPEGs and historical screenshot captures identified in the asset register are excluded from the grant because their provenance is unknown. They are not part of the active product or screenshot gallery. See [license policy](docs/LICENSE_POLICY.md) and the [asset provenance register](docs/audit/ASSET_LICENSE_REGISTER.md). The MIT grant does not make FROSTGUARD medically validated or production-certified.
