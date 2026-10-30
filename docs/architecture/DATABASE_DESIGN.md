# Database architecture

The authoritative schema is apps/api/prisma/schema.prisma, with its committed Prisma migration and MySQL-specific assets in database/sql. Detailed entity, normalization, integrity and migration notes are maintained in docs/database/DATABASE_DESIGN.md.

## Current data boundaries

- Organization-owned identities and roles: Organization, User, Role, Permission, Membership, RefreshToken.
- Cold-chain catalog and stock: TemperatureProfile, Product, Supplier, Batch, Warehouse, StorageUnit.
- IoT evidence: Sensor, SensorAssignment, append-only SensorReading, DeviceSimulation, MaintenanceLog.
- Movement: Vehicle, Driver, Shipment, ShipmentItem, ShipmentEvent.
- Response: Excursion, Alert, Incident, IncidentAction, NotificationLog.
- Integrity/operations: AuditLog, OutboxEvent, IdempotencyRecord.

Prisma relations and foreign keys provide referential integrity. Product and batch references to a temperature profile are validated against the active organization in their write transactions. Global IDs alone do not prove tenant ownership; all other input relation IDs require the same service-level scope review. Composite tenant foreign keys are not used consistently.

## Migration evidence

The initial committed Prisma migration and all four SQL files (views, triggers, procedures, constraints/indexes) were applied to the disposable frostguard_migration_test schema on 2026-10-30. SQL statements were executed with mysql2 because the normal tsx wrapper failed in this Windows environment with uv_os_get_passwd returned ENOMEM. The MySQL integration suite separately passes against frostguard_test.

## Related design records

- docs/database/DATABASE_DESIGN.md — normalized entities, relational integrity, referential actions and UTC.
- docs/database/ER_DIAGRAM.md — entity relationship diagram.
- docs/database/INDEX_STRATEGY.md — indexes.
- docs/architecture/TRANSACTION_DESIGN.md — transaction boundary summary.

This prototype is not production-certified or medically validated.
