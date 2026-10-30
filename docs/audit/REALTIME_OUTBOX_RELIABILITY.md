# Realtime and transactional outbox reliability audit

**Assessment date:** 2026-10-30\
**Status:** PARTIALLY_IMPLEMENTED; database claiming and topic authorization verified locally, distributed Socket.IO fanout and durable delivery remain open.\
**Scope:** outbox claim/retry lifecycle, Socket.IO organization and permission fanout, and browser recovery after disconnect. This is not an end-to-end delivery guarantee.

## Previous behavior and failure modes

Before this change, `apps/api/src/services/outbox.ts` selected `PENDING` rows with `findMany`, emitted them, then updated each row to `PUBLISHED`. The only overlap guard was a module-level boolean, so separate API processes could select the same rows. A process crash after emit and before status update could cause duplicate emission. `publishToOrg` returned successfully even when the Socket.IO server was not initialized, which could mark an event published without an emit. The worker retried thrown errors with exponential backoff, then marked the event `FAILED` after 12 attempts.

The prior Socket.IO connection middleware validated membership and account activity at handshake, then placed every user in one `org:<id>` room. This made all event topics visible to every member of that organization even where the REST API requires a narrower permission. Membership/permission changes were not rechecked on established connections. Socket.IO uses its in-memory adapter; events emitted by one API process do not reach sockets connected to a different API process.

## Implemented safeguards

- Added nullable `claimToken` and `claimedUntil` fields plus a status/lease index to the existing outbox model. The additive migration is `apps/api/prisma/migrations/20261030163000_outbox_leases/migration.sql`.
- `claimOutboxBatch` selects eligible `PENDING` rows and expired `CLAIMED` leases in a short transaction using MySQL `FOR UPDATE SKIP LOCKED`, sets a unique worker claim token and 30-second lease, then returns only rows bearing that token.
- Multiple `drainOutbox` calls have distinct tokens and rely on database locking rather than a process-local overlap flag.
- Acknowledgement and retry release are conditional on both `CLAIMED` status and the current token. A stale worker cannot mark a reclaimed event published or release another worker's claim.
- Worker failures apply bounded exponential backoff. At 12 failed attempts, the row becomes `FAILED`; no operator replay endpoint is implemented, so recovery of a poison row remains an operational gap.
- If Socket.IO is not initialized or a topic is unmapped / lacks an organization, publication returns false and the worker releases the row for retry instead of acknowledging it.
- Each emitted payload includes its stable database `eventId`. The web realtime bridge suppresses duplicate event IDs in a bounded in-memory set (500 IDs). This reduces duplicate UI effects during one page session; it is not durable exactly-once processing.
- Socket connections load active membership and role permissions. They join only permission-scoped rooms. Event topic mapping is: sensor readings and excursions → `telemetry:read`; alerts and incidents → `incident:read`; shipment updates → `shipment:read`; batch creation → `batch:read`; product creation → `product:read`. Client-controlled organization subscription is not supported. Unknown and unscoped topics fail closed.
- Established sockets revalidate membership, user activity, and permissions every 30 seconds by default. Revoked membership, inactive users, changed permission sets, and database revalidation failures disconnect the socket. The interval is configurable for deterministic tests.
- On reconnect, the web client invalidates its known query roots to recover state missed while disconnected.

## Tests added

`apps/api/tests/outbox.test.ts` uses an isolated temporary organization and event rows to test concurrent worker claims, expired-lease recovery, stale acknowledgement rejection, and retry release/backoff. It does not delete or modify seeded outbox rows.

`apps/api/tests/realtime.test.ts` uses actual Socket.IO clients and a local HTTP server to test same-tenant delivery, cross-tenant separation, permission-specific topic visibility, changed-role disconnect, and invalid-token rejection.

The first targeted outbox run failed because the test batch selected older seeded outbox rows before its own fixture rows. That run is not counted as passing evidence. Fixtures and claim scoping were isolated by a temporary test organization. The first isolated combined run passed all outbox tests but exposed a wrong compound-key lookup in the socket role-change test; the lookup was corrected to the actual unique role key. The subsequent targeted run passed all six outbox and Socket.IO tests.

## Delivery model and limitations

The database claim is multi-worker safe under MySQL 8 locking semantics. The transport remains **at-least-once submission with bounded retries**, not exactly-once delivery. A crash after Socket.IO emits and before the conditional acknowledgement can cause the same `eventId` to be emitted again after lease expiry. Browser dedupe is best-effort and in-memory; other consumers must also deduplicate by `eventId`.

`PUBLISHED` currently means submitted to the local Socket.IO server adapter, not received or acknowledged by a browser. The project does not configure a cross-process Socket.IO adapter. Therefore multiple API processes can safely claim database work but do not provide fleet-wide realtime fanout: a worker on process A cannot reach clients attached to process B. Do not horizontally scale Socket.IO/API workers until a shared adapter (such as a separately configured and tested Redis adapter) is added or a single realtime publisher is enforced.

Ordering across independent workers is not guaranteed. Current clients invalidate API query caches rather than applying event payloads as authoritative state. Replay endpoint, durable consumer offsets, browser event persistence, poison-event tooling, adapter-based multi-process fanout, and observed worker crash tests remain open.

## Verification record

| Check | Result |
| --- | --- |
| `npm.cmd run db:generate -w @frostguard/api` | PASS; Prisma Client 6.19.3 generated from the additive schema. Existing `.env` was read by Prisma CLI but its contents were not displayed or modified. |
| `npm.cmd run typecheck` | PASS after all outbox/schema/socket/test changes. |
| `npm.cmd run lint` | PASS after outbox/schema/socket changes. |
| `npm.cmd test -w @frostguard/api -- tests/outbox.test.ts tests/realtime.test.ts` | PASS; 2 files / 6 tests against `frostguard_test`, using the documented temporary process-only preload due to host `tsx` issue. |
| Fresh migration deploy | PASS; `npm.cmd run db:deploy -w @frostguard/api` applied both migrations to newly created disposable `frostguard_outbox_migration_test`. No existing test/main schema was used for this check. |
| Multi-process Socket.IO fanout | NOT IMPLEMENTED; no adapter in dependencies/configuration. |

No remote publication, deployment, or external broker was used. The changes have not been committed.
