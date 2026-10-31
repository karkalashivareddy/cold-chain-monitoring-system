# Index Strategy

Indexes are reviewed against current query paths in `apps/api/src/modules/*`, schema declarations, and SQL additions in `database/sql/004_constraints_indexes.sql`. No standalone production query-load benchmark was performed.

## Existing index patterns

| Access pattern | Existing index/constraint | Purpose |
| --- | --- | --- |
| Login by email | `User.email` unique | Identity lookup. |
| Membership by tenant/user | unique `(orgId,userId)` | Resolve active tenant membership. |
| Product catalog lookup | unique `(orgId,code)`, index `(orgId,name)` | Tenant key and name listing. |
| Batch lookup | unique `(orgId,productId,batchNumber)`, `(orgId,status)`, `expiresAt`, `storageUnitId` | Identity, available inventory, expiry and storage association. |
| Warehouse/storage | unique `(orgId,code)`, storage `warehouseId` | Tenant code and warehouse relation. |
| Sensor assignment | `(sensorId,endedAt)`, `storageUnitId`, `shipmentId` | Current assignment and resource lookup. |
| Reading history | unique `(sensorId,bootId,sequenceNumber)`, `(orgId,recordedAt)`, `(sensorId,recordedAt)`, SQL `(orgId,sensorId,sequenceNumber)` | Replay/idempotency within a boot epoch and time-ordered retrieval. |
| Shipment list | `(orgId,status)`, `(orgId,createdAt)` plus SQL `(orgId,status,createdAt)` | Tenant status/time filters. |
| Shipment event timeline | `(shipmentId,occurredAt)` | Ordered shipment event detail. |
| Excursion/alert/incident queues | org/status/time, severity, entity/date indexes | Operational queue filters and drill-downs. |
| Audit history | `(orgId,createdAt)`, `(orgId,entityType,entityId)` | Tenant chronology and entity investigation. |
| Outbox | `(status,availableAt)`, `(orgId,createdAt)` | Worker polling and organization history. |

## Review notes

- Composite indexes should follow actual leftmost equality filters and ordering. Existing DBMS page exposes selected `EXPLAIN FORMAT=JSON` plans, but no measured workload was collected in this audit.
- `SensorReading` append rate can dominate table size; retention, partitioning and archival require a stated operational policy and load measurements before adoption.
- A new outbox claim/lease protocol may require an index matching worker status, availability and lease columns.
- Avoid duplicate indexes when adding an index that prefixes an existing unique/composite key. Confirm with `SHOW INDEX` and actual query plans after migrations.
- Do not add indexes based only on diagram completeness; compare query plans and write cost.

## Verification

The integration suite passed and the DBMS routes expose plans for telemetry range, open excursions, shipment risk, device health, and stock reservation. There is no benchmark dataset or before/after latency claim.
