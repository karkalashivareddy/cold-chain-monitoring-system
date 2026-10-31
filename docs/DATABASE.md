# FROSTGUARD — Database Design

FROSTGUARD uses **MySQL/InnoDB** as its authoritative store. The schema is defined with Prisma and extended with hand-written SQL for views, triggers, stored procedures, check constraints and additional indexes.

- ORM schema: `apps/api/prisma/schema.prisma`
- Initial migration: `apps/api/prisma/migrations/20261030124615_init`
- Post-migration SQL: `database/sql/001_views.sql` … `004_constraints_indexes.sql`
- SQL applier: `apps/api/prisma/apply-sql.ts`
- Seed: `apps/api/prisma/seed.ts`

---

## 1. Target and conventions

- Database engine: **MySQL 8.4 LTS / InnoDB**, matching the Prisma schema target, Docker Compose image and CI service.
- ORM field names are camelCase; mapped table names are snake_case.
- Identifiers are `cuid()` strings except high-volume append tables:
  - `sensor_readings.id` — `BigInt` autoincrement.
  - `audit_logs.id` — `BigInt` autoincrement.
- All timestamps are stored with UTC semantics. The API emits ISO-8601 UTC strings. Organization timezone is stored for display/context but does not change database timestamps.
- Decimal temperatures/humidity use explicit precision, generally `DECIMAL(5,2)`; profiles also use `DECIMAL(4,2)` for warning margin.
- Status/type fields are strings constrained by application schemas and, where noted, database `CHECK` constraints. Prisma does not use native MySQL enums in this schema.
- Prisma's `DateTime` values are written as UTC instants; MySQL `UTC_TIMESTAMP()` is used in hand-written SQL and triggers.
- Organization-scoped tables carry `orgId`; services filter by it explicitly. Tenant isolation is not enforced by database row-level security.

The initial migration was applied with a schema/collation consistent with `utf8mb4_unicode_ci`. The stored-procedure file contains an explicit collation note because a schema created by `prisma db push` can inherit the server default `utf8mb4_0900_ai_ci`, while Prisma migrations create `utf8mb4_unicode_ci`; routine parameters that meet columns are pinned to avoid MySQL error 1267.

---

## 2. Schema inventory

There are **31 Prisma models** (tables), plus Prisma's `_prisma_migrations` bookkeeping table when migrations are used.

### Identity and tenancy

| Model | Table | Purpose and notable constraints |
| --- | --- | --- |
| `Organization` | `organizations` | Tenant root. `slug` unique; `timezone` defaults to `UTC`. |
| `User` | `users` | Global user identity. `email` unique; password hash, active flag, last login. |
| `Role` | `roles` | `key` unique. Six seeded roles. |
| `Permission` | `permissions` | `key` unique. Permission catalogue. |
| `RolePermission` | `role_permissions` | Composite PK `(roleId, permissionId)`; cascades on role/permission delete. |
| `Membership` | `memberships` | User ↔ organization + role. Unique `(orgId, userId)`; indexes on user and role. |
| `RefreshToken` | `refresh_tokens` | `tokenHash` unique, family id, selected `orgId`, expiry, revocation, replacement id, IP/user agent. Indexes on `(userId, revokedAt)`, `familyId` and `(orgId, userId)`; family rotation remains in the selected organization. |

### Catalogue and inventory

| Model | Table | Purpose and notable constraints |
| --- | --- | --- |
| `TemperatureProfile` | `product_temperature_profiles` | Org-scoped profile: min/max, warning margin, optional critical bounds, persistence readings, default flag. Unique `(orgId, name)`. |
| `Product` | `products` | Org-scoped product with code, category, storage type and min/max. Unique `(orgId, code)`; index `(orgId, name)`; optional profile FK. |
| `Supplier` | `suppliers` | Org-scoped supplier. Unique `(orgId, code)`. |
| `Batch` | `batches` | Org/product batch with quantity, remaining quantity, status, expiry, optional supplier/storage unit/profile. Unique `(orgId, productId, batchNumber)`; indexes `(orgId, status)`, `expiresAt`, `storageUnitId`. |
| `Warehouse` | `warehouses` | Org-scoped site with optional coordinates. Unique `(orgId, code)`. |
| `StorageUnit` | `storage_units` | Unit inside a warehouse, with type, capacity, local min/max and status. Unique `(orgId, code)`; index `warehouseId`. |

### IoT

| Model | Table | Purpose and notable constraints |
| --- | --- | --- |
| `Sensor` | `sensors` | Org-scoped device. `deviceId` globally unique; API-key hash and prefix; status, last seen, calibration due. Index `(orgId, status)`. |
| `SensorAssignment` | `sensor_assignments` | Historical assignment to a storage unit, shipment, or neither. `endedAt` marks closure. Indexes on `(sensorId, endedAt)`, `storageUnitId`, `shipmentId`. |
| `SensorReading` | `sensor_readings` | Append-only telemetry. Auto-increment `BigInt` id. Unique `(sensorId, bootId, sequenceNumber)` for replay protection across reboots. Indexes `(orgId, recordedAt)`, `(sensorId, recordedAt)`. Stores provenance (`isSimulated`, `source`). |
| `DeviceSimulation` | `device_simulations` | Simulation run metadata: scenario, interval, status, timestamps, creator. Index `(orgId, status)`. |

### Logistics

| Model | Table | Purpose and notable constraints |
| --- | --- | --- |
| `Vehicle` | `vehicles` | Org-scoped vehicle. Unique `(orgId, plateNumber)`. |
| `Driver` | `drivers` | Org-scoped driver. Unique `(orgId, licenseNumber)`. |
| `Shipment` | `shipments` | Org-scoped shipment. `code` globally unique. Origin/destination coordinates, status, timestamps, progress and risk score. Indexes `(orgId, status)`, `(orgId, createdAt)`. |
| `ShipmentItem` | `shipment_items` | Unique `(shipmentId, batchId)`; quantity. Index `batchId`. |
| `ShipmentEvent` | `shipment_events` | Timeline events with optional coordinates and actor. Index `(shipmentId, occurredAt)`. |

### Monitoring and response

| Model | Table | Purpose and notable constraints |
| --- | --- | --- |
| `Excursion` | `temperature_excursions` | Org-scoped temperature event. `dedupeKey` unique; optional storage unit/shipment, severity, status, min/max, duration, reading count, peak reading id. Indexes `(orgId, status)`, `(orgId, startedAt)`, `shipmentId`. |
| `Alert` | `alerts` | Org-scoped alert, optionally linked to an excursion. `dedupeKey` unique. Indexes `(orgId, status, createdAt)`, `(orgId, severity)`. |
| `Incident` | `incidents` | Org-scoped response case. `code` globally unique; unique optional `alertId` and `excursionId`; severity, status, assignee, risk score, resolution/outcome. Indexes `(orgId, status, openedAt)`, `assigneeId`. |
| `IncidentAction` | `incident_actions` | Audit-like action timeline for an incident. Index `(incidentId, createdAt)`. |
| `MaintenanceLog` | `maintenance_logs` | Org/unit maintenance record, optional sensor, performer, status. Index `(orgId, performedAt)`. |

### Platform and infrastructure

| Model | Table | Purpose and notable constraints |
| --- | --- | --- |
| `AuditLog` | `audit_logs` | Auto-increment `BigInt` id. Org, optional actor, action, entity, JSON metadata, IP, request id. Indexes `(orgId, createdAt)`, `(orgId, entityType, entityId)`. |
| `NotificationLog` | `notification_logs` | In-app notification records only; no delivery provider. Index `(orgId, createdAt)`. |
| `OutboxEvent` | `outbox_events` | Transactional outbox: topic, JSON payload, status, attempts, availability, publication time, error. Indexes `(status, availableAt)`, `(orgId, createdAt)`. |
| `IdempotencyRecord` | `idempotency_records` | Unique `(scope, key)` and expiry. Used by the DBMS rollback demonstration; telemetry replay protection uses the reading sequence unique key instead. Index `expiresAt`. |

### Relationship summary

```text
Organization
 ├─ Membership ── User ── RefreshToken
 ├─ Product ── Batch ── ShipmentItem ── Shipment
 ├─ TemperatureProfile (product / batch)
 ├─ Supplier
 ├─ Warehouse ── StorageUnit ── SensorAssignment ── Sensor ── SensorReading
 │                               └─ Shipment (transport assignment)
 ├─ Vehicle / Driver ── Shipment
 ├─ Excursion ── Alert ── Incident ── IncidentAction
 ├─ MaintenanceLog
 ├─ AuditLog / NotificationLog / OutboxEvent
 └─ DeviceSimulation
```

---

## 3. Referential actions

Important `onDelete` behavior:

- Organization deletion cascades to most tenant-owned tables.
- User deletion cascades to refresh tokens and memberships; references from incidents, shipment events, simulations and audit logs use `SetNull` where history should survive.
- Batch/product/supplier/warehouse/storage-unit/shipment relationships mostly restrict or `SetNull` rather than cascading, protecting inventory and history.
- `SensorReading` cascades when a sensor is deleted. In normal operation sensors are revoked, not deleted.
- `IncidentAction` cascades with its incident.
- `OutboxEvent`/`IdempotencyRecord` may have a nullable organization and cascade when present.

Application code generally deactivates or revokes rather than deleting business entities. Product `DELETE` is a soft deactivate.

---

## 4. Application-level and database-level validation

Validation exists at several layers:

1. **Shared Zod schemas** (`packages/shared/src/index.ts`) for auth, products, batches, warehouses, storage units, devices, shipments, telemetry, simulations and incident transitions.
2. **Route-local Zod schemas** for position updates, maintenance logs, member creation and role changes.
3. **Service checks** for organization ownership, state transitions, stock availability, expiry, assignment and incident workflow.
4. **Prisma constraints** for uniqueness, foreign keys and required fields.
5. **MySQL triggers and CHECK constraints** for invariants that must hold even if application code is bypassed.

Some limits are service-specific:

- Temperature range for products/units/profiles: `-90..40 °C` (telemetry accepts `-100..80 °C`).
- Humidity: `0..100`.
- Batch quantity: `1..1,000,000`.
- Shipment progress: `0..100`.
- Telemetry readings older than 30 days or more than 5 minutes in the future are rejected.
- API pagination caps differ by endpoint (usually 100, telemetry readings 500, latest telemetry 50).

---

## 5. SQL layer

`database/sql` is applied **after** Prisma migrations by:

```bash
npm run db:sql
```

`apps/api/prisma/apply-sql.ts`:

- Connects with `mysql2` using `DATABASE_URL` (text protocol).
- Reads `*.sql` in sorted filename order.
- Splits on `-- @statement`.
- Executes each statement.
- Ignores duplicate-object errors (existing index, foreign key, check constraint or “already exists”).
- Fails on other errors.

This split is necessary because Prisma's prepared-statement protocol cannot execute all DDL, notably `DROP TRIGGER`.

### 5.1 Views (`001_views.sql`)

| View | Contents | Active filter |
| --- | --- | --- |
| `v_active_excursions` | Excursion + sensor, storage unit, warehouse, shipment and incident context. | `status IN ('OPEN', 'RECOVERED')` |
| `v_shipment_risk` | Shipment risk plus total/open/critical excursion counts. | No status filter; groups all shipments. |
| `v_warehouse_performance` | Storage units, stored batches and excursions in the last 30 days per warehouse. | Excursions limited to 30 days. |
| `v_device_health` | Sensor status, last seen, calibration due, last reading, 7-day reading count and minutes since reading. | Readings limited to 7 days. |
| `v_active_incidents` | Incident status/risk, assignee and linked excursion details. | `status IN ('OPEN', 'ACKNOWLEDGED', 'INVESTIGATING')` |

These views are exposed to permitted users through `GET /api/v1/dbms/views` and are used by the DBMS `EXPLAIN` endpoint for `v_device_health`.

### 5.2 Triggers (`002_triggers.sql`)

| Trigger | Timing/table | Invariant |
| --- | --- | --- |
| `trg_sensor_readings_immutable` | `BEFORE UPDATE` on `sensor_readings` | Any update raises SQLSTATE `45000`: telemetry is append-only. |
| `trg_audit_logs_immutable_update` | `BEFORE UPDATE` on `audit_logs` | Direct mutation raises SQLSTATE `45000`; audit events are append-only. |
| `trg_audit_logs_immutable_delete` | `BEFORE DELETE` on `audit_logs` | Direct deletion raises SQLSTATE `45000`; audit events are append-only. |
| `trg_batches_stock_guard` | `BEFORE UPDATE` on `batches` | `remainingQuantity` cannot be negative or exceed `quantity`. |
| `trg_incident_resolution_guard` | `BEFORE UPDATE` on `incidents` | Status `RESOLVED` requires `resolutionNotes` of at least 10 characters. |
| `trg_shipment_delivery_stamp` | `BEFORE UPDATE` on `shipments` | Sets `deliveredAt` to `UTC_TIMESTAMP(3)` if status is `DELIVERED` and the timestamp is null; rejects progress outside `0..100`. |

The append-only trigger protects **updates**, not deletes. A privileged database user could still delete telemetry rows unless separate privileges/controls are added. No such control is configured in this repository.

### 5.3 Stored procedures (`003_procedures.sql`)

#### `sp_reserve_batch_stock(p_batch_id, p_quantity)`

- Rejects null or non-positive quantity with `INVALID_QUANTITY`.
- Selects `remainingQuantity, status` `FOR UPDATE`.
- If no row: `BATCH_NOT_FOUND`.
- If insufficient stock: `INSUFFICIENT_STOCK`.
- Decrements `remainingQuantity`.
- Sets batch status to `DISPATCHED` when the new remaining quantity is zero.
- Returns the new remaining quantity.

The procedure itself does not check organization ownership or the batch's current status; the shipment service performs those checks before calling it. The procedure's parameters are explicitly collated to `utf8mb4_unicode_ci` to avoid collation mismatch with Prisma-created tables.

#### `sp_incident_summary(p_org_id)`

Returns incident counts, average risk score and oldest open timestamp grouped by `status` and `severity` for one organization. Called by `GET /api/v1/dbms/incident-summary`.

### 5.4 CHECK constraints and indexes (`004_constraints_indexes.sql`)

Nine check constraints:

| Constraint | Table | Rule |
| --- | --- | --- |
| `chk_excursion_minmax` | `temperature_excursions` | `minTemp <= maxTemp` |
| `chk_reading_range` | `sensor_readings` | `temperature BETWEEN -100 AND 80` |
| `chk_reading_humidity` | `sensor_readings` | humidity null or `0..100` |
| `chk_batch_quantities` | `batches` | `0 <= remainingQuantity <= quantity` |
| `chk_batch_dates` | `batches` | `expiresAt > manufacturedAt` |
| `chk_shipment_progress` | `shipments` | progress `0..100` |
| `chk_profile_range` | `product_temperature_profiles` | `minTemp < maxTemp` |
| `chk_alert_severity` | `alerts` | severity in `INFO`, `WARNING`, `CRITICAL` |
| `chk_incident_severity` | `incidents` | severity in `INFO`, `WARNING`, `CRITICAL` |

Additional indexes:

- `idx_readings_org_sensor_seq` on `(orgId, sensorId, sequenceNumber)`.
- `idx_alerts_status_severity` on `(status, severity, createdAt)`.
- `idx_shipments_org_status_created` on `(orgId, status, createdAt)`.

Duplicate-index/constraint errors are ignored by the applier, but MySQL versions can differ in whether a check constraint name collision is reported as a duplicate. Re-running is described as safe by the SQL file and applier, not independently verified against every MySQL 8.x minor version.

---

## 6. Transactions and isolation

| Operation | Isolation | Timeout | Notes |
| --- | --- | --- | --- |
| Telemetry ingestion | `ReadCommitted` | 15 s | Insert reading, evaluate, excursion/alert/incident, audit, outbox in one transaction. |
| Shipment dispatch | `Serializable` | 20 s | Row lock (`FOR UPDATE`), stored-procedure stock reservation, retries `P2034`/`P2028`. |
| Create/deliver/position/cancel shipment | Prisma default | Prisma default | Audit and outbox written in the transaction. |
| Incident transitions | Prisma default | Prisma default | State machine, action row, audit, outbox. |
| DBMS rollback proof | Prisma default | Prisma default | Inserts a row, deliberately throws, then counts from a new query to prove rollback. |
| Login last-login + audit | Batched transaction | Prisma default | `$transaction([...])`. |

Default Prisma/MySQL isolation is the server default (typically `REPEATABLE READ` for InnoDB) unless the schema/app changes it. The code explicitly sets isolation only where noted above.

### Row-level locking

- Dispatch locks the shipment row with raw `SELECT ... FOR UPDATE`.
- `sp_reserve_batch_stock` locks the batch row with `SELECT ... FOR UPDATE`.
- This produces exactly-once stock decrement under two concurrent dispatches; the integration test exercises that race.

### Outbox

- Outbox rows are written inside the same transaction as the business change.
- The worker polls `PENDING` rows whose `availableAt <= now`, every second, 50 at a time.
- Failures increment `attempts`, set exponential backoff (capped at 60 s), and mark `FAILED` after 12 attempts.
- Publication is not idempotently deduplicated for consumers.

---

## 7. Query and reporting patterns

The application mixes Prisma queries with raw SQL:

- **Prisma** for CRUD, tenant-scoped filters, includes and straightforward pagination.
- **Raw parameterized SQL** for time bucketing (`UNIX_TIMESTAMP` + `FLOOR`), warehouse/device aggregates, latest-reading joins and `EXPLAIN`.
- **Stored procedures** for stock reservation and incident summary.

Reports:

- Temperature CSV: filtered by org, optional sensor, date range and simulated flag; capped at 50,000 rows; maximum 90-day range.
- Shipment CSV: createdAt range.
- Incident CSV: openedAt range.
- Batch traceability CSV: registered batch, shipment events and excursions.
- Operations summary PDF: dashboard KPIs plus up to 12 active incidents; generated with PDFKit and streamed to the response.

There is no asynchronous report job, report archive or object storage.

### EXPLAIN endpoints

`GET /api/v1/dbms/explain?query=...` accepts:

- `telemetry-range`
- `open-excursions`
- `shipment-risk`
- `device-health`

Each returns `EXPLAIN FORMAT=JSON` for a representative, org-parameterized query. `GET /api/v1/dbms/explain-reservation` explains the `SELECT ... FOR UPDATE` used by stock reservation for a batch in the caller's organization.

---

## 8. Seed data

`apps/api/prisma/seed.ts` is deterministic and destructive for the demo tenants:

1. Upserts roles and permissions and resets role-permission mappings.
2. Deletes organizations with slugs `northline` and `meridian` (cascading demo data).
3. Deletes `@northline.demo` / `@meridian.demo` users.
4. Recreates:
   - Northline Biologics (`northline`, timezone `Asia/Kolkata`) with owner/manager/operator/auditor/viewer users.
   - Meridian Cold Logistics (`meridian`) with one owner.
5. Creates profiles, suppliers, products, batches, warehouses, storage units, sensors, vehicles, drivers, shipments, events, excursions, alerts, incidents, audit rows and notifications.
6. Writes sensor readings with `isSimulated=true` and `source="SEED"`.
7. Prints demo user identities and explicitly reports that device key material is not printed.

All seeded users share `SEED_DEMO_PASSWORD` (default `Frostguard#2026`). Demo device keys are predictable (`fgd_demo_<deviceid>_2026`) and must never be used outside local demos. Only their SHA-256 digests are stored.

The seed is intended for demonstration and integration-test setup, not production data loading.

---

## 9. Migrations vs test schema

- Application setup: `prisma migrate dev` → apply SQL → seed.
- CI validates committed migrations on a clean database before tests. The integration suite separately creates a loopback database whose name must end in `_test`, runs `prisma db push --force-reset`, applies SQL and seeds it.

Consequences:

- The SQL layer must remain compatible with both migration-created and `db push`-created schemas. The procedure collation note exists because of this.
- Integration tests exercise a disposable schema created by `db push`; migration deployment is covered as a separate CI gate. Use `TEST_DATABASE_URL` to select another loopback database ending in `_test`.
- Tests default to `mysql://root:root@localhost:3306/frostguard_test`; setup refuses a non-loopback host or a database name without the `_test` suffix. Do not point tests at a database you care about.

---

## 10. UTC policy

- API inputs use ISO-8601 strings with offsets; services convert to `Date`.
- Database writes use `Date` objects; MySQL stores them as UTC-based values (no per-org timezone conversion).
- Views use `UTC_TIMESTAMP()` and `DATE_SUB(..., INTERVAL ... DAY)`.
- CSV/PDF exports label timestamps as UTC (`*_utc` fields).
- The web UI formats dates for display; organization timezone is available in the session object.
- There is no automatic daylight-saving conversion of stored timestamps, and no timezone-aware reporting beyond formatting.

---

## 11. Operational gaps

Not implemented or not verified:

- Backup/restore automation, point-in-time recovery and retention jobs.
- Read replicas, failover, partitioning or archival of telemetry.
- Encryption at rest/TDE configuration.
- Database user least-privilege separation (the app uses one connection string).
- Migration rollback/runbook beyond Prisma's standard tooling.
- Automated schema drift detection or query-performance regression tests. CI does validate committed migrations on a clean MySQL 8.4 service.
- Organization deletion cascades can remove associated audit history because MySQL does not invoke child delete triggers for cascades; a database owner can also alter/drop integrity triggers. No retention or separate least-privilege DBA workflow is configured.
- A trigger preventing deletion of `sensor_readings`.
- The outbox uses DB-backed `SKIP LOCKED` leases with token-fenced acknowledgements across pollers. Socket.IO fanout still uses the in-memory adapter, and there is no permission-checked failed-event replay interface or exactly-once delivery guarantee.
- Docker/MySQL 8.4 runtime verification.

The local setup and command reference are in the root [README](../README.md).
