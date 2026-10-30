# Transaction failure and rollback audit

**Date:** 2026-10-30\
**Status:** PARTIALLY_IMPLEMENTED\
**Test target:** disposable local MySQL schema `frostguard_test` only. Vitest global setup recreates and seeds this schema. Do not set this suite to a valuable database.

## Failure injection and evidence

The integration suite installs a test-only MySQL `BEFORE INSERT` trigger on `outbox_events` that raises SQLSTATE `45000`. It removes the trigger in `finally`. Trigger DDL uses `mysql2/promise`; Prisma parameterized raw execution rejected `CREATE TRIGGER` with MySQL error 1295, so that invalid fixture mechanism was replaced. No production schema change was needed for fault injection.

| Workflow | Injected failure point | Verified rollback | Test |
|---|---|---|---|
| Telemetry ingestion | After reading/device/audit writes, at required outbox insert | Reading absent; device `lastSeenAt` unchanged; audit/outbox counts unchanged; retrying the same sequence succeeds once | `apps/api/tests/transaction-failure.test.ts` |
| Shipment dispatch | After stock reservation/status and related writes, at outbox insert | Shipment remains `PLANNED`; batch stock unchanged; no `DISPATCHED` event remains | Same |
| Incident disposition | At outbox insert after resolution/action/audit work | Incident remains `INVESTIGATING`; no resolution action/audit/outbox record remains | Same |
| Shipment creation | At initial required outbox insert | No shipment row remains | Same |

The four rollback tests passed in the complete MySQL suite (56 tests total). Outbox worker tests separately exercise concurrent claims, lease recovery, stale acknowledgement rejection and retry release. The tests do not simulate a physical API process crash between Socket.IO emit and database acknowledgement; delivery therefore remains at-least-once, not exactly once.

## Transaction model observed in source

- Telemetry writes run in a `ReadCommitted` Prisma transaction. Sensor-scoped locking serializes sequence/state evaluation; immutable readings, device state, excursion/alert state, audit and outbox writes are committed together. Outbox publication is performed by a worker after commit.
- Shipment dispatch uses a `Serializable` transaction and row locks for shipment/batch reservation. Prisma raw MySQL deadlock 1213 is retried with a bounded policy; the contention tests establish one valid winner and a conflict for the other reservation.
- Incident resolution locks the tenant-scoped incident row, validates the state transition, then persists disposition, action, related alert/excursion status, audit, notification/outbox as a transaction.
- MySQL engine is InnoDB. Database-specific procedures/triggers and migration SQL are applied by the test setup before integration assertions.

## Remaining fault coverage

The suite does not inject a failure before the first write (there is no business state to roll back), at the server's final COMMIT packet, during network loss after commit, or at every intermediate database statement. Cancellation/stock release does not yet have the same trigger-injected rollback assertion. These are not represented as tested. Commit-ack uncertainty requires idempotency/reconciliation rather than assuming that a client-observed network failure means rollback.

## Reproduction

From repository root, use the documented process-only `NODE_OPTIONS` wrapper in `docs/development/TEST_ENVIRONMENT.md` on this Windows host, then run:

```powershell
npm.cmd test
```

The latest full run completed **12 files / 56 tests passed**. The final release report records the timestamp and host limitation. No production data or database was used.
