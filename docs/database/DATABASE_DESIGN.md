# Database Design

**Source of truth:** `apps/api/prisma/schema.prisma`, its migration under `apps/api/prisma/migrations/`, and `database/sql/001_views.sql` through `004_constraints_indexes.sql`. This document summarizes the schema observed in the repository; the more detailed legacy [database overview](../DATABASE.md) describes SQL objects and setup.

## Engine and data model

The application uses MySQL through Prisma Client and MySQL-specific SQL. Tables are intended for InnoDB transactions. IDs are generally opaque `cuid()` strings; telemetry and audit log IDs use auto-increment `BigInt`. Temperature fields use fixed precision (`DECIMAL(5,2)`), coordinates use `DECIMAL(9,6)`, and recorded/received/created instants use `DateTime` mapped to MySQL timestamp/datetime behavior.

The schema groups:

- **Tenant and identity:** `Organization`, `User`, `Role`, `Permission`, `RolePermission`, `Membership`, `RefreshToken`.
- **Catalog and inventory:** `TemperatureProfile`, `Product`, `Supplier`, `Batch`, `Warehouse`, `StorageUnit`.
- **IoT:** `Sensor`, `SensorAssignment`, append-only `SensorReading`, `DeviceSimulation`, `MaintenanceLog`.
- **Logistics:** `Vehicle`, `Driver`, `Shipment`, `ShipmentItem`, `ShipmentEvent`.
- **Monitoring/response:** `Excursion`, `Alert`, `Incident`, `IncidentAction`, `NotificationLog`.
- **Platform integrity:** `AuditLog`, `OutboxEvent`, `IdempotencyRecord`.

## Integrity and normalization

The schema separates organization membership from global user identity, product from batch, product temperature profile from individual readings, shipment header from shipment items/events, and incident from its ordered action history. Uniqueness scopes business keys by organization where defined (for example, product code and batch number); telemetry sequences are unique per sensor. SQL checks enforce selected ranges and triggers enforce append-only telemetry updates, batch quantity bounds, incident resolution note length and shipment progress.

Several IDs are globally unique but organization ownership is stored separately on related records. Service code must continue validating that referenced batches, vehicles, drivers, warehouses and assignees belong to the same organization. Database composite tenant foreign keys are not used consistently and should be considered in a future migration after reviewing Prisma relation constraints.

Temperature thresholds are profile-specific. A threshold excursion is evidence to investigate, not a product disposition. The schema stores observations and human incident outcome; it does not model a universal product stability/potency algorithm.

## Referential actions

The schema mostly uses explicit `Cascade`, `SetNull`, or default restrictive relation behavior. Cascades are suitable for tenant-owned demo aggregates but require careful retention policy for audit and telemetry in a real deployment. The append-only reading trigger protects `UPDATE`, not deletion by a privileged database user. See [technical debt](../audit/TECHNICAL_DEBT.md).

## Migrations and UTC

There is a committed initial Prisma migration plus raw SQL objects applied by `apps/api/prisma/apply-sql.ts`. Integration setup instead uses `prisma db push --force-reset` on `frostguard_test`, then applies SQL and seed data. Persist UTC instants; convert to organization/user timezone only for display and exports with an explicit timezone label.

## Related documents

- [Existing database and DBMS feature notes](../DATABASE.md)
- [ER diagram](ER_DIAGRAM.md)
- [Index strategy](INDEX_STRATEGY.md)
- [Transaction design](TRANSACTION_DESIGN.md)
