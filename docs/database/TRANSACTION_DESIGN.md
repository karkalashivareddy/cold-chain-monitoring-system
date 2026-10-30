# Transaction design

**Evidence date:** 2026-10-30. This document records behavior observed in the current service code and MySQL tests. It does not describe guarantees beyond the implemented isolation/locking.

## Telemetry ingestion

Endpoint: POST /api/v1/telemetry/readings. Device authentication uses device identity and its current hashed credential; user telemetry history routes are authenticated separately.

1. Validate the Zod payload and resolve deviceId. Reject unknown/revoked devices and invalid credentials. Recorded time may be no more than five minutes in the future or thirty days old.
2. Begin a Prisma interactive transaction at ReadCommitted with a 15-second timeout.
3. Lock the sensor row using a parameterized SELECT id FROM sensors WHERE id = ? FOR UPDATE.
4. Recheck current sensor status and the device key while holding the row lock. Read the active assignment within the transaction; device assignment changes acquire the same sensor-row lock.
5. Read the latest sequence and determine whether the incoming reading is delayed/out-of-order.
6. Insert the immutable SensorReading. Unique sensorId/sequenceNumber rejects exact replay. The MySQL update trigger rejects historical reading mutation.
7. Update last-seen/status. For a lower sequence, keep the row as historical evidence, mark the response/outbox event outOfOrder, and do not change live excursion/alert state.
8. Derive isSimulated from trusted internal simulator context. An external device request cannot mark its physical device reading simulated.
9. For in-order data, resolve profile and evaluate temperature. Apply configured consecutive-reading persistence; create/update/recover excursion and relevant alert/incident state.
10. Write audit and outbox rows in the same transaction, commit, then allow the periodic outbox worker to publish.

The seven API/MySQL test files (40 cases) verify duplicate replay, append-only history, product profile isolation, delayed readings, device provenance and a persisted critical excursion/alert/incident. No test injects a failure midway through telemetry to assert all writes roll back. Concurrent ingestion/reassignment and sequence-counter reset/re-provisioning are not yet tested or modeled.

## Shipment creation, dispatch and inventory

Shipment creation verifies the origin warehouse, optional vehicle/driver and batch IDs belong to the caller organization. It creates the planned shipment, items, initial event, audit and outbox records in a transaction. Creation checks availability before commit but does not reserve/decrement stock; the authoritative stock gate is dispatch.

Dispatch uses a Prisma Serializable transaction with retry for recognized Prisma serialization/timeout failures. It locks the tenant-scoped shipment row with SELECT FOR UPDATE, checks state and item membership, validates each batch belongs to the same organization and has sufficient remaining stock, calls the stored procedure sp_reserve_batch_stock (which locks/conditionally decrements stock), then updates shipment state/event/audit/outbox before commit.

Shipment tests verify one decrement, rejection of repeat dispatch, concurrent duplicate dispatch of the same shipment, and two different shipments competing for one batch. A MySQL raw-query deadlock is retried; the winning dispatch decrements stock once and the losing shipment stays planned with HTTP 409. Failure injection after stock decrement remains outstanding. There is no pre-dispatch stock reservation to release on cancellation; cancellation is currently limited to draft/planned lifecycle states.

## Incident resolution

Incident resolution first locks the tenant-scoped `incidents` row with `SELECT ... FOR UPDATE`, then validates current state and updates the incident, linked alert/excursion, notification, action, audit and outbox in a Prisma transaction. A MySQL trigger rejects resolved incidents without adequate resolution notes. The integration suite races two resolution requests and verifies exactly one returns success, one conflicts, and one resolution action persists. Mid-transaction rollback injection remains untested.

Disposition is a human-entered outcome; the system does not declare product safe or spoiled from a temperature threshold.

## Transactional outbox

Business transactions write OutboxEvent before commit. The in-process worker polls pending rows after commit, emits to organization-scoped Socket.IO rooms, and marks events published; errors use backoff and eventual FAILED status.

The process-local running flag prevents overlapping drains in one process, not cross-process competition. Multiple API instances may publish duplicates; delivery is not an acknowledged durable consumer protocol. A lease/atomic claim or singleton worker policy, stable event IDs and idempotent consumers are required before horizontal scaling.

## Isolation, migration and rollback evidence

- Telemetry uses ReadCommitted and a sensor-row lock.
- Shipment dispatch uses Serializable and shipment/batch locking.
- Other service transactions use Prisma/MySQL defaults unless their service says otherwise.
- The DBMS showcase includes an explicit rollback example.
- The API/MySQL suite resets only its dedicated frostguard_test schema with db push, SQL objects and seed data.
- A separate newly created frostguard_migration_test schema accepted the committed initial Prisma migration. The 34 statements in 001_views.sql through 004_constraints_indexes.sql were also applied there using the existing mysql2 driver.
- The repository db:sql npm script could not start locally because tsx raised uv_os_get_passwd returned ENOMEM. This local tool limitation is recorded; the SQL script behavior itself was exercised through mysql2 on the disposable schema. Existing frostguard and frostguard_test schemas were not used for migration validation.

## Remaining transaction tests

- Inject failure after telemetry insert and before outbox commit; assert no partial domain/outbox state.
- Race telemetry against reassignment and credential revocation.
- Race separate shipments competing for the same stock.
- Inject failure after shipment stock decrement; assert shipment and stock both roll back.
- Inject failure after incident state update; assert resolution/action/audit/outbox all roll back.
- Incident resolution contention is covered by the lifecycle test; broaden to concurrent assign/resolve if those semantics are changed.
- Verify outbox retry/restart and multi-worker claim behavior.
