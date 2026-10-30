# Security test results

**Evidence date:** 2026-10-30\
**Assessment type:** source review plus automated API/MySQL, Socket.IO and Playwright tests. No penetration test or external security assessment was performed.

## Executed and passed

- Full API/MySQL suite: **13 files / 66 tests** passed against disposable `frostguard_test`, including authentication/RBAC, cross-tenant, transaction rollback, device telemetry, outbox and Socket.IO permissions, CSV export safety, and API docs/OpenAPI behavior.
- `cross-tenant-authorization.test.ts`: 5 tests passed across Northline and Meridian: object reads/writes/deletes, foreign relation references, report/search/audit scoping and user membership.
- `transaction-failure.test.ts`: 4 tests passed with test-only MySQL trigger injection: telemetry, shipment dispatch stock, incident disposition, and shipment creation all rollback when the required outbox insert fails.
- `outbox.test.ts` + `realtime.test.ts`: 6 tests passed: concurrent claims, expired leases, stale acknowledgements, retry, tenant separation, per-topic permissions, role-change disconnect and invalid token.
- Telemetry coverage includes device credential rejection, duplicate sequence replay, append-only trigger, out-of-order reading policy and synthetic provenance spoof rejection.
- Shipment tests cover stock decrement, repeat dispatch, contention, one winner/one conflict, and deadlock retry.
- Incident tests cover transitions, audit actions, DB resolution guard, concurrent resolution and one persisted resolution action.
- Browser suite: 3 Playwright tests passed, including 14 authenticated routes and mobile focus; no API 5xx/page JS error reported in route smoke.
- Typecheck, lint, production build, and fresh additive Prisma migration on disposable schema passed.
- Fresh npm audit reports three high findings in Prisma config/deepmerge-ts dependency paths; these remain open and are assessed in `DEPENDENCY_ADVISORY_ASSESSMENT.md`.

## Not performed or still open

- No penetration test, fuzz test or external security assessment.
- Endpoint authorization matrix is route-group level; exhaustive per-handler/export tests and side-channel equivalence are incomplete.
- No actual multi-process Socket.IO adapter/fanout test. Outbox worker identities are simulated concurrently in one process; crashes, replay after poison events, and a shared broker are unverified.
- Transaction rollback injection does not cover shipment cancellation/release or uncertain commit acknowledgement.
- No production TLS, private MySQL boundary, managed secrets, backup/restore, hosted deployment, or remote CI run for this uncommitted revision. The latest verified remote run is `41098761499` on the earlier code SHA `4237f09`.
- No automated axe/WCAG, screen-reader or full keyboard audit.
- Windows test runner requires the documented temporary process preload due to `uv_os_get_passwd returned ENOMEM`; no shim exists in repository or production configuration.

The test suite resets and seeds only `frostguard_test`. Do not point it at a database containing data that matters. Expected Prisma constraint errors in test output represent deliberate negative assertions.
