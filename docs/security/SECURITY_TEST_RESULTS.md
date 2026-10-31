# Security test results

**Evidence date:** 2026-10-31\
**Assessment type:** source review plus automated API/MySQL, Socket.IO and Playwright tests. No penetration test or external security assessment was performed.

## Executed and passed

- Full API/MySQL suite: **13 files / 74 tests** passed against disposable `frostguard_test`, including authentication/RBAC, cross-tenant, transaction rollback, device telemetry, outbox and Socket.IO permissions, CSV export safety, and API docs/OpenAPI behavior.
- `cross-tenant-authorization.test.ts`: 5 tests passed across Northline and Meridian: object reads/writes/deletes, foreign relation references, report/search/audit scoping and user membership.
- `transaction-failure.test.ts`: 4 tests passed with test-only MySQL trigger injection: telemetry, shipment dispatch stock, incident disposition, and shipment creation all rollback when the required outbox insert fails.
- `outbox.test.ts` + `realtime.test.ts`: 6 tests passed: concurrent claims, expired leases, stale acknowledgements, retry, tenant separation, per-topic permissions, role-change disconnect and invalid token.
- Telemetry coverage includes device credential rejection, duplicate replay within a boot epoch, accepting sequence reset after reboot, append-only trigger, out-of-order reading policy and synthetic provenance spoof rejection.
- Audit database triggers reject direct updates and deletes; integration tests exercise both rejections.
- Refresh-token organization binding has a multi-membership regression test; DBMS authorization denies organization managers and permits owners.
- Shipment tests cover stock decrement, repeat dispatch, contention, one winner/one conflict, and deadlock retry.
- Incident tests cover transitions, audit actions, DB resolution guard, concurrent resolution and one persisted resolution action.
- Browser suite: **5 Playwright tests passed**, including public landing across five viewport sizes, seeded dashboard, fleet map, product workflow and 14 authenticated routes.
- Typecheck, lint, production build, and a fresh disposable MySQL 8.4 Prisma migration deployment passed. SQL-control application succeeded after a Windows-only `tsx` startup workaround.
- Current npm audit reports **3 high** findings in the Prisma config/deepmerge-ts dependency path and 11 moderate development-tool findings; `npm audit --omit=dev` reports the same 3 high. These remain open and are assessed in `DEPENDENCY_ADVISORY_ASSESSMENT.md`.

## Not performed or still open

- No penetration test, fuzz test or external security assessment.
- Endpoint authorization matrix is route-group level; exhaustive per-handler/export tests and side-channel equivalence are incomplete.
- No actual multi-process Socket.IO adapter/fanout test. Outbox worker identities are simulated concurrently in one process; crashes, replay after poison events, and a shared broker are unverified.
- Transaction rollback injection does not cover shipment cancellation/release or uncertain commit acknowledgement.
- GitHub Actions run [41166761519](https://github.com/karkalashivareddy/cold-chain-monitoring-system/actions/runs/41166761519) passed all configured gates on source commit `ae85f75`. This report's documentation update is verified locally; use workflow history to confirm CI for the latest docs commit.
- No production TLS, private MySQL boundary, managed secrets, backup/restore or hosted deployment is evidenced.
- Browser route checks include axe-core serious/critical assertions for the documented routes/viewports; an independent screen-reader review and full assistive-technology audit were not performed.
- Windows test runner requires the documented temporary process preload due to `uv_os_get_passwd returned ENOMEM`; no shim exists in repository or production configuration.

The test suite resets and seeds only `frostguard_test`. Do not point it at a database containing data that matters. Expected Prisma constraint errors in test output represent deliberate negative assertions.
