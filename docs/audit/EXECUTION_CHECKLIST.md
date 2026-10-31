# Release execution checklist

**Started:** 2026-10-31 00:00 UTC (workspace date: 2026-10-31)
**Starting revision:** `42f1ab5e1c48ef4fa41f7e3b46a9094e70aefb46` on `main`
**Workspace:** shared Windows checkout, Git remote `origin`; not Codex Cloud execution.
**Rule:** a gate is VERIFIED only from evidence on the resulting commit. Existing edits/untracked files are preserved unless deliberately reviewed and included.

## Gate status

| Gate | Status | Evidence / remaining work |
|---|---|---|
| A — repository preservation | IMPLEMENTED_NOT_VERIFIED | Latest `origin/main` fetched and matched starting SHA. Pre-existing edits and untracked assets identified. Recheck status and staged paths before commit/push. |
| B — backend and database | PARTIALLY_IMPLEMENTED | MySQL suite 13 files / 69 tests passed on disposable `frostguard_test`; cancellation/dispatch serialization plus cancellation and shipment-event outbox rollback tests pass. Clean migration on final commit remains for CI. |
| C — frontend workflows and accessibility | PARTIALLY_IMPLEMENTED | Full Playwright 4/4 passes: public landing, seeded dashboard, 14-route/details smoke with axe, and product validation/create/edit/archive. Landing/dashboard five viewport checks and serious/critical axe scans pass; screenshots were visually reviewed. Independent screen-reader review and every route at every viewport remain. |
| D — security | PARTIALLY_IMPLEMENTED | Tenant and API suites remain in regression coverage. Latest audit reports three high Prisma/deepmerge-ts findings, including `--omit=dev`; documented compatibility mitigation remains. No independent penetration test. |
| E — telemetry/realtime reliability | PARTIALLY_IMPLEMENTED | Existing outbox tests/evidence retained. Single-process Socket.IO/outbox/simulator limit documented; no cross-process adapter or worker-process recovery proof. |
| F — local deployment | IMPLEMENTED_NOT_VERIFIED | API/web Dockerfiles, Compose, Nginx proxy, internal MySQL network, volume and health checks added; Compose syntax passes. Docker Engine missing, so no image/runtime/backup-restore verification. |
| G — QA | PARTIALLY_IMPLEMENTED | Clean `npm ci`, Prisma generation, typecheck, lint, build, MySQL 69/69, Playwright 4/4, Compose syntax and asset allowlist checks pass. Docker image/runtime verification remains blocked by missing local Engine. |
| H — GitHub | IN_PROGRESS | Starting remote main and run `41110200375` verified. Commit/push is pending; inspect CI for the exact resulting SHA. |
| I — versioned release | BLOCKED | No release will be created while container runtime validation and final CI are outstanding; the high advisory is assessed but unresolved. Release requires all applicable gates and a truthful decision. |

## Changes verified locally

- Shipment cancellation locks the tenant-scoped row in a serializable transaction, sharing serialization with dispatch. Timeline events now write event, audit and outbox together.
- Rollback tests cover cancellation and timeline-event outbox failure; a concurrent cancellation/dispatch test checks shipment status against batch stock.
- Seed output no longer prints passwords or device key material.
- Axe checks cover landing at 375x812, 390x844, 768x1024, 1366x768 and 1920x1080; all listed authenticated routes at desktop; dashboard at all five viewports; products at 390x844. Critical/serious findings pass after fixes. This is not a WCAG conformance claim.
- Vite copies only `apps/web/public-safe/`; the production output was checked and contains no JPEGs. Original unknown-provenance JPEGs remain untouched and excluded.
- Product management reuses the shared field-validating dialog. Browser workflow covers validation, create, edit and archive against the actual API.
- Docker Compose syntax parses. No Docker daemon is available in this workspace.

## Next actions

1. Review the source, documentation and staged-path diff; keep unknown JPEGs and historical contaminated screenshots unstaged.
2. Re-run migration/SQL validation in CI's disposable MySQL job on the pushed SHA.
3. Commit and push without history rewriting; verify remote SHA and CI result.
4. Do not create a tag/release unless all required gates pass. Container runtime, independent review and the assessed high advisory remain release limitations.
