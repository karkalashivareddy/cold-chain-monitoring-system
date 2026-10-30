# Transaction architecture

Detailed transaction evidence and remaining test gaps are maintained in docs/database/TRANSACTION_DESIGN.md.

## Implemented boundaries

| Workflow | Isolation and locks | Atomic records |
|---|---|---|
| Telemetry | ReadCommitted; lock sensor row, revalidate credential/status and read active assignment under that lock | Immutable reading, device last-seen/status, in-order excursion/alert/incident changes, audit and outbox |
| Shipment dispatch | Serializable; lock shipment row, stored procedure locks and conditionally updates batch stock | Stock decrement, shipment state/event, audit and outbox |
| Incident resolution | Prisma interactive transaction; tenant-scoped incident row locked with `SELECT ... FOR UPDATE` before state transition validation | Incident outcome, action, linked alert/excursion, notification, audit and outbox |

Outbox publication happens after commit. MySQL workers now claim rows using `FOR UPDATE SKIP LOCKED` with expiring leases and token-fenced acknowledgements/retries. Delivery is at-least-once with bounded retries; process crash after emission can duplicate an event, and Socket.IO's in-memory adapter does not fan out across API processes. Until a shared adapter is configured and tested, run one realtime-serving API process.

## Verification status

The latest API/MySQL suite passes 56 tests across 12 files. Telemetry ordering, tenant references, shipment contention, concurrent incident resolution, outbox lease recovery, stale acknowledgements and topic permissions have regression tests. Four injected outbox insert failures verify rollback of telemetry, dispatch stock/state, incident disposition and shipment creation. Fresh additive migration passed on a dedicated disposable schema. Cancellation/release rollback, commit acknowledgement uncertainty, and true separate-process worker crash recovery remain unverified.

See docs/database/TRANSACTION_DESIGN.md for actual steps, isolation details and remaining test procedures.
