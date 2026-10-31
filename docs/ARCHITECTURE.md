# FROSTGUARD — Architecture

This document describes the architecture that exists in the repository. It deliberately separates **implemented behavior** from **deployment assumptions** and **not-yet-built work**.

---

## 1. System context

FROSTGUARD is a browser-first, multi-tenant cold-chain operations platform with a device-facing telemetry endpoint.

```text
Users (owner / admin / manager / operator / auditor / viewer)
        │
        │ HTTPS · JSON · cookies or bearer access token · CSRF header
        ▼
┌───────────────────────────────────────────────────────────────┐
│ React SPA                                                     │
│  React 19 · Vite · Tailwind 4 · React Query · React Router    │
│  Leaflet map · Socket.IO client · permission gates             │
└───────────────────────────┬───────────────────────────────────┘
                            │ /api/v1 + /socket.io
                            ▼
┌───────────────────────────────────────────────────────────────┐
│ Express 5 API                                                 │
│                                                               │
│  security middleware → routes → validation → services         │
│  Prisma → MySQL                                               │
│  transactional outbox worker → Socket.IO org rooms            │
└───────────────────────────┬───────────────────────────────────┘
                            │
        ┌───────────────────┼────────────────────┐
        ▼                   ▼                    ▼
   MySQL 8.4 LTS      OpenStreetMap        Device / simulator
   InnoDB schema      raster tiles         POST telemetry readings
```

### Runtime processes

| Process | Entry point | Responsibility |
| --- | --- | --- |
| API | `apps/api/src/server.ts` | HTTP API, Socket.IO server, outbox polling, simulator timers, graceful shutdown. |
| Web dev server | `apps/web` via Vite | SPA development server on port 5173. |
| Web production build | `apps/web/dist` | Optionally served by the API from the same origin. |
| MySQL | External dependency | Authoritative persistent state, constraints, triggers, views, procedures. |
| Outbox worker | In-process module `apps/api/src/services/outbox.ts` | Publishes committed outbox rows to Socket.IO. |
| Simulator | In-process module `apps/api/src/modules/simulations/simulations.service.ts` | Generates explicitly simulated readings through the ingestion service. |

There is no separate worker process, queue broker, Redis adapter or container definition in the repository.

---

## 2. Monorepo boundaries

```text
apps/api
  src/config/        parsed, fail-closed environment
  src/lib/           Prisma singleton, HTTP envelope, errors, SQL helpers
  src/middleware/    request context, auth, CSRF, rate limits, validation, errors
  src/security/      Argon2id, JWT, refresh-token and device-key primitives
  src/services/      audit helper and transactional outbox
  src/realtime/      Socket.IO authentication and room publishing
  src/modules/       one folder per domain area
  prisma/            schema, migration, seed, SQL applier
  tests/             Vitest integration suite

apps/web
  src/components/    application shell, UI primitives, charts, map, dialogs
  src/lib/           API client, auth context, React Query, realtime bridge
  src/pages/         route-level screens

packages/shared
  src/index.ts       roles, permissions, enums, Zod schemas, envelope types

database/sql
  001_views.sql
  002_triggers.sql
  003_procedures.sql
  004_constraints_indexes.sql
```

`packages/shared` is the contract package. It contains framework-agnostic Zod schemas and permission constants used by both API and web. Some route-specific validation (for example, position updates, maintenance logs and user role changes) is declared locally in the relevant router.

---

## 3. API layering

A request normally passes through these layers:

```text
HTTP
  │
  ├─ Helmet
  ├─ CORS allowlist
  ├─ requestContext          x-request-id validation/generation
  ├─ pino-http               structured request logging
  ├─ express.json            1 MB limit
  ├─ cookie-parser
  ├─ csrfGuard               cookie-authenticated writes need x-frostguard-csrf: 1
  ├─ globalLimiter
  │
  ├─ /health
  ├─ /api/v1 (router)
  │    ├─ authenticate       JWT + live membership lookup
  │    ├─ requirePermission  database-derived permissions
  │    ├─ validate           Zod body/query validation
  │    └─ service            business transaction / query
  │
  ├─ static SPA fallback     only when apps/web/dist/index.html exists
  ├─ notFoundHandler
  └─ errorHandler
```

### Route/service split

- **Routers** own HTTP concerns: authentication, permission declarations, validation, status codes and response envelopes.
- **Services** own domain logic and transactions: organization scoping, state machines, concurrency, audit/outbox writes and data shaping.
- **Prisma** is the default data-access layer. Raw SQL is used where set-based aggregation, `EXPLAIN`, `FOR UPDATE`, or stored routines are appropriate.
- **`mysql2`** is used by `apply-sql.ts` because Prisma's prepared-statement protocol cannot execute all DDL used by the SQL layer.

There is no generic repository abstraction. Domain services call Prisma directly, which keeps transactions and row-level locking visible.

---

## 4. Authentication and session lifecycle

### Access token

- JWT signed with `JWT_ACCESS_SECRET`.
- Algorithm restricted to **HS256** on verification.
- Issuer `frostguard`, audience `frostguard-web`.
- Claims: `sub` (user id), `org` (organization id), `role` (role key).
- Default TTL: 900 seconds (`ACCESS_TOKEN_TTL_SECONDS`).
- Accepted from `Authorization: Bearer …` or the `fg_access` cookie.

### Refresh token

- Opaque random value: 48 random bytes encoded as base64url.
- Only a SHA-256 hash is stored in `refresh_tokens.tokenHash`.
- Stored with a `familyId`, expiry, IP and user agent.
- Rotated on every successful refresh: a new row is created and the old row is marked revoked with `replacedById`.
- Reuse of an already-revoked refresh token revokes every unrevoked token in the same family and returns `401`.
- Browser delivery: `fg_refresh` httpOnly cookie scoped to `/api/v1/auth`.

Refresh tokens are opaque random values stored as hashes in MySQL. Each refresh-token family stores the organization selected at login; refresh rotation requires that same active membership and cannot silently switch the user to another tenant.

### Login

`POST /api/v1/auth/login`:

1. Normalize/validate email, password and optional organization slug.
2. Load the user and all memberships.
3. Verify Argon2id hash. A dummy hash is verified for unknown accounts to reduce enumeration timing signal.
4. Select the requested organization membership or the user's first membership.
5. Issue access + refresh tokens.
6. Set both cookies.
7. Update `lastLoginAt` and write an `auth.login` audit row in one transaction.

The response also returns the access token so the SPA can keep it in memory. The httpOnly cookies remain the fallback and refresh mechanism.

### Per-request revalidation

`authenticate` verifies the JWT, then loads `membership(orgId, userId)` with role and permissions. If the membership is missing or the user is inactive, the request is rejected immediately. Consequently:

- Role changes take effect without waiting for the access token to expire.
- Removing a membership invalidates access at the next request.
- The token's `role` claim is not trusted for authorization decisions; the database relationship is.

### Logout

`POST /api/v1/auth/logout` revokes the refresh-token family when a refresh token is supplied (cookie or body), then clears both cookies. It is not protected by `authenticate`, so an expired access token does not prevent logout.

### Socket authentication

Socket.IO uses the same access token from `handshake.auth.token`, a bearer header, or the `fg_access` cookie. Membership and user-active state are checked before the socket joins `org:<orgId>`. A revoked membership cannot keep receiving events on an already-open socket.

---

## 5. Authorization and tenant isolation

### RBAC model

Database tables:

- `roles` — six role keys.
- `permissions` — 23 permission keys.
- `role_permissions` — many-to-many mapping.
- `memberships` — user ↔ organization + role, unique per `(orgId, userId)`.

Seeded role intent:

| Role | Intent |
| --- | --- |
| `owner` | Full organization control, including `org:manage`. |
| `admin` | All permissions except `org:manage`. |
| `manager` | Operational management, dispatch, incident resolution, reports and audit read. |
| `operator` | Day-to-day telemetry, batches, shipments and incident handling; cannot resolve incidents. |
| `auditor` | Read-only operational visibility plus audit/report access. |
| `viewer` | Read-only operational visibility without audit/report access. |

### Enforcement

- `requirePermission(...permissions)` requires every listed permission.
- Permissions come from the current membership's role, not from client input.
- Web routes use `PermissionGate` mirrors of the API permissions; this is UX gating, not the security boundary.
- All domain queries include `orgId`, or first load a record with `{ id, orgId }`.
- Cross-tenant access is generally reported as `404` to avoid confirming the existence of another tenant's record.
- Writes validate referenced entities belong to the caller's organization (warehouse, vehicle, driver, batches, sensor, storage unit, shipment, assignee).

### Organization selection

A user may belong to multiple organizations. Login can specify `organizationSlug`; otherwise the first membership is used. There is no organization-switching endpoint; a new login selects a different membership. Refresh uses the user's first membership, which is a limitation for multi-organization users.

---

## 6. Domain modules

| Module | Main responsibility |
| --- | --- |
| `auth` | Login, refresh rotation, logout, current session. |
| `products` | Product catalogue and temperature limits. |
| `batches` | Batch registration/update, expiry and traceability. |
| `warehouses` | Warehouse CRUD. |
| `storage-units` | Storage unit CRUD and maintenance logs. |
| `devices` | Sensor provisioning, assignment, key rotation/revocation, stats. |
| `telemetry` | Device ingestion, reading history, latest readings, bucketed series. |
| `monitoring` | Pure profile resolution, temperature evaluation and risk scoring (called by telemetry). |
| `simulations` | In-process scenario simulator. |
| `shipments` | Planning, map, dispatch, delivery, position, events, cancellation. |
| `alerts` | Alert listing and acknowledgement. |
| `incidents` | State machine, assignment, investigation, resolution, notes, stats. |
| `dashboard` | Aggregated operational overview and trend data. |
| `analytics` | Risk, warehouse, device, expiry and delivery analytics. |
| `audit` | Paginated audit-log reads. |
| `users` | Members, role changes, assignable users. |
| `reports` | Temperature/shipment/incident/batch CSV and summary PDF. |
| `dbms` | Schema inventory, views/triggers/routines, `EXPLAIN`, rollback proof. |
| `health` | Liveness and database-backed readiness. |

Routers are mounted under `/api/v1` in `apps/api/src/app.ts`. The full endpoint list is in [API.md](API.md).

---

## 7. Telemetry ingestion and excursion evaluation

The critical path is `POST /api/v1/telemetry/readings`, implemented in `telemetry.routes.ts` and `telemetry.service.ts`.

```text
Device request
  │
  ├─ telemetry rate limit (600/min per device key or IP)
  ├─ Zod validation
  ├─ require x-device-key
  ├─ optional HMAC signature check
  │
  ▼
Load sensor by deviceId (uppercased)
  ├─ unknown device → uniform 401
  ├─ revoke check
  ├─ device-key SHA-256 comparison in constant time
  ├─ recordedAt must be ≤ 5 minutes in the future
  ├─ recordedAt must be ≤ 30 days old
  │
  ▼
Transaction (ReadCommitted, 15 s timeout)
  ├─ insert reading
  │    unique (sensorId, bootId, sequenceNumber) → duplicate replay is a 200 no-op
  ├─ update sensor lastSeenAt/status
  ├─ resolve applicable temperature profile
  ├─ evaluate temperature
  ├─ open/update/recover excursion
  ├─ create alert; create incident for critical
  ├─ update shipment riskScore when sensor is assigned to a shipment
  ├─ write audit row
  └─ append outbox events
```

### Idempotency

A replay of the same `(sensorId, bootId, sequenceNumber)` triggers a Prisma `P2002` unique-constraint error. The service catches only that unique constraint and returns:

```json
{
  "success": true,
  "data": {
    "duplicate": true,
    "message": "Duplicate boot and sequence pair ignored (idempotent replay)."
  }
}
```

with HTTP `200` instead of `201`. The reading is not stored twice.

### Clock handling

- Readings more than 5 minutes in the future are rejected.
- Readings older than 30 days are rejected.
- Timestamps are parsed to `Date` and stored by MySQL as UTC-based `DATETIME` values.

### Temperature profile resolution

`resolveProfile()` in `apps/api/src/modules/monitoring/excursion.engine.ts` resolves, in order:

1. **Shipment target:** collect profiles from the shipment's batches or their products; use the **intersection** (highest minimum, lowest maximum), so one permissive product cannot widen a mixed-load envelope. Critical bounds come from profile critical values, defaulting to `min − 3 °C` and `max + 3 °C`. Persistence is the maximum configured value.
2. **Product limits fallback** when shipment batches have no profiles: same intersection logic over product min/max, critical defaults ±3 °C, persistence 2.
3. **Storage-unit target:** profiles of non-empty batches in the unit; otherwise the storage unit's own min/max; critical defaults ±3 °C, persistence 2.
4. **No target:** returns `null`; evaluations remain `NORMAL` because there is no configured envelope.

### Persistence rule

A new excursion is only created after the configured number of consecutive out-of-range readings in the same device boot epoch. Ingestion locks the sensor row before reading prior sequence state, serializing concurrent submissions for that sensor. The engine looks back at earlier readings in the same `bootId` by descending `sequenceNumber` and requires all of them to be out of range. `persistenceReadings <= 1` disables persistence for that profile. Devices must supply a new stable `bootId` on each reboot; ordering is per boot epoch, while latest telemetry is selected by database insertion order.

An open excursion is updated with new min/max, duration and reading count; a subsequent in-range reading marks it `RECOVERED` and resolves its open/acknowledged alerts.

### Risk score

For a new critical excursion, the score is:

```text
base            45 (critical) or 22 (warning)
+ deviation     min(25, round(deviation °C × 6))
+ duration      min(20, round(durationMinutes × 0.5))
+ recurrence    min(10, repeatedExcursions × 3)
+ missing data  10 when applicable
clamped         0..100
```

Shipment risk is also set to `80` for a critical excursion and `50` for a warning; analytics can raise it further for open critical excursions, stale telemetry or a missed ETA. This is a transparent operational heuristic, **not** a validated medical/regulatory risk model.

### Provenance

`SensorReading` carries:

- `isSimulated` — true for seed/simulator data.
- `source` — `DEVICE`, `SIMULATOR` or `SEED`.
- `sequenceNumber` — per-sensor idempotency key.
- `receivedAt` — server receipt time; `recordedAt` — device time.

Database triggers reject direct updates to `sensor_readings` and both updates and deletes to `audit_logs`, protecting their append-only history during ordinary application-role statements. A database owner can still alter triggers, and MySQL cascades do not invoke child-table delete triggers; separate least-privilege DBA controls and retention policy are still required for stronger guarantees.

---

## 8. Shipment lifecycle and concurrency

Shipment states used by the service:

```text
PLANNED ──dispatch──► DISPATCHED ──position──► IN_TRANSIT ──deliver──► DELIVERED
   │                       │                        │
   └──────cancel───────────┘                        └──► DELAYED (position update may set)
CANCELLED
```

`createShipment` validates:

- Origin warehouse exists in the organization and has coordinates.
- Optional vehicle and driver exist in the organization and are active.
- Every batch exists in the organization.
- Each batch has enough remaining stock and is `AVAILABLE` or `RESERVED`, and is not expired.

Dispatch (`dispatchShipment`) is the concurrency-critical operation:

1. `withRetry` retries serialization/transaction errors (`P2034`, `P2028`) up to three attempts with jittered delay.
2. Opens a **Serializable** transaction with a 20-second timeout.
3. Executes `SELECT status FROM shipments WHERE id = ? AND orgId = ? FOR UPDATE`.
4. Rejects missing shipments or invalid source states.
5. Rechecks every batch's organization and available quantity.
6. Calls `CALL sp_reserve_batch_stock(batchId, quantity)` for each item. The procedure locks the batch row with `FOR UPDATE`, validates quantity, decrements `remainingQuantity`, and sets status to `DISPATCHED` when stock reaches zero.
7. Updates the shipment to `DISPATCHED`, creates a departure event, writes audit and appends an outbox event.

The integration suite verifies that two simultaneous dispatches produce exactly one success (`200`) and one conflict (`409`), and stock is decremented exactly once.

The database also enforces non-negative stock, stock ≤ original quantity, shipment progress in `0..100`, and a delivery timestamp when status becomes `DELIVERED`.

---

## 9. Transactional outbox and realtime

Domain transactions never publish directly to Socket.IO. They insert an `outbox_events` row in the same transaction as the business change. This prevents a client from seeing an event whose transaction later rolls back.

```text
service transaction
  ├─ business row(s)
  ├─ audit row
  └─ outbox row (PENDING)

outbox worker (every 1 second, batch 50)
  ├─ select due PENDING rows
  ├─ publish to org room (or global if orgId is null)
  ├─ mark PUBLISHED + publishedAt
  └─ on failure: increment attempts, exponential backoff, FAILED after 12
```

Topics observed in services include:

- `sensor:reading`
- `excursion:created` / `excursion:updated`
- `alert:created`
- `incident:created` / `incident:updated`
- `shipment:updated`

The SPA maps topics to React Query cache roots in `apps/web/src/lib/realtime.ts`, so a realtime event triggers targeted refetches.

### Realtime limitations

- Socket.IO runs without a shared adapter. Org rooms and publication are process-local.
- The outbox worker is an in-process timer, not a separately scaled worker.
- Publication is at-least-once from the outbox's perspective: a crash after publish but before marking `PUBLISHED` can republish.
- If no Socket.IO server is initialized, publication fails and the claim is released with retry/backoff; the row is not marked published.
- Failed rows have no permission-checked replay or recovery interface yet.

---

## 10. Database integration

- Prisma schema: `apps/api/prisma/schema.prisma` — 31 models.
- Initial migration: `apps/api/prisma/migrations/20261030124615_init`.
- Post-migration SQL: `database/sql/*.sql`, applied by `apps/api/prisma/apply-sql.ts`.

The SQL applier uses `mysql2` because Prisma cannot execute all DDL through its prepared-statement path. It splits files on `-- @statement`, executes statements in filename order, and ignores duplicate-object errors so the layer can be re-applied.

Database engineering features used by the application:

- Five views for active excursions, shipment risk, warehouse performance, device health and active incidents.
- Four triggers for append-only readings, stock guards, incident resolution evidence and shipment delivery stamping/progress.
- Two stored procedures: stock reservation and incident summary.
- Nine `CHECK` constraints and additional composite indexes.
- `EXPLAIN FORMAT=JSON` endpoints for representative telemetry, excursion, shipment and device queries.

See [DATABASE.md](DATABASE.md).

---

## 11. API conventions

### Success envelope

```json
{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "…"
  }
}
```

Paginated responses add `page`, `pageSize`, `total` and `totalPages` to `meta`.

### Error envelope

```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Missing permission: incident:resolve",
    "details": {}
  },
  "meta": {
    "requestId": "…"
  }
}
```

Known error codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR`, `DEVICE_AUTH_FAILED`, `IDEMPOTENT_REPLAY`, `UNPROCESSABLE`.

The central error handler maps:

- `AppError` → declared status/code.
- `ZodError` → `400 VALIDATION_ERROR` with issue paths.
- Prisma `P2002` → `409 CONFLICT`.
- Prisma `P2003` → `409 CONFLICT`.
- Prisma `P2025` → `404 NOT_FOUND`.
- Prisma `P2034` → `409 CONFLICT` (retryable concurrency conflict).
- Prisma validation error → `400 VALIDATION_ERROR`.

In non-production, 500 responses include a `debug` object. Production suppresses internal messages.

### Serialization

`apps/api/src/lib/http.ts` converts `BigInt` values to strings before JSON serialization. This is required for `SensorReading.id` and `AuditLog.id`, which are auto-increment `BigInt`s. Dates are serialized by `JSON.stringify` as ISO strings; Prisma `Decimal` values become JSON strings unless service code converts them.

### Request IDs

`requestContext` accepts a client `x-request-id` only if it matches `[a-zA-Z0-9-]{8,64}`; otherwise it generates a UUID. The ID is returned in the response header and envelope, and is included in audit rows where services pass it.

---

## 12. Web application architecture

- React 19 with lazy-loaded route pages.
- React Router with `/`, `/login`, `/app/*` and a not-found route.
- `RequireAuth` protects `/app`.
- `PermissionGate` wraps each route with the matching read permission.
- React Query owns server state and invalidation.
- Access token is kept in a module-level variable, not `localStorage`.
- API client (`apps/web/src/lib/api.ts`) always sends `x-frostguard-csrf: 1`, uses `credentials: "include"`, performs a single-flight refresh on `401`, then retries once.
- Socket.IO client connects with the in-memory token. Events invalidate relevant query keys.
- Leaflet renders shipment routes and markers with OpenStreetMap tiles; the CSP allows the tile hosts.
- The UI labels simulated readings with a dedicated badge and explanatory text.

The `/` public landing page is implemented. It has a Chromium smoke test against development and production preview plus inspected desktop/mobile screenshots. Authenticated API-backed screens have not yet completed a browser visual audit.

---

## 13. Startup, shutdown and operations

`server.ts`:

1. Creates the Express app.
2. Creates the HTTP server.
3. Initializes Socket.IO.
4. Starts the outbox worker.
5. Listens on `API_PORT`.
6. On `SIGINT`/`SIGTERM`, stops the worker, clears simulator timers, closes Socket.IO, closes the HTTP server and disconnects Prisma.

Health:

- `GET /health/live` — process liveness, no database access.
- `GET /health/ready` — `SELECT 1`, pending outbox count, active incident count.

Logging: Pino + `pino-http`, with request IDs and status-based levels. Health endpoints are excluded from automatic HTTP logging.

---

## 14. Deployment status

The repository includes multi-stage API/web Dockerfiles, a local Compose deployment, an Nginx reverse proxy, and GitHub Actions validation. It does **not** include:

- Kubernetes manifests,
- TLS termination configuration,
- a database backup/restore job,
- a secret manager integration,
- centralized log/metric/trace export,
- a multi-instance Socket.IO adapter or shared rate-limit store.

GitHub Actions validation in `.github/workflows/ci.yml` performs npm installation, Prisma migration and SQL application, typecheck, lint, production build, public browser smoke, MySQL integration tests and dependency advisory classification. Review the [workflow history](https://github.com/karkalashivareddy/cold-chain-monitoring-system/actions/workflows/ci.yml) for the latest main-branch result. CI is evidence for that commit only; local Docker image/startup verification and hosted production deployment remain unverified.

The API can serve `apps/web/dist` from the same origin if it exists, which removes cross-site cookie complexity for a single-host deployment. That code path exists, but no production deployment was verified.

See the root [README](../README.md) for the honest status summary and the local MySQL setup.
