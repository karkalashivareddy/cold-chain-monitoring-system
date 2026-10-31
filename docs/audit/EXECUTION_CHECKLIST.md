# Release execution checklist

**Started:** 2026-10-31 00:00 UTC (workspace date: 2026-10-31)
**Starting revision:** `42f1ab5e1c48ef4fa41f7e3b46a9094e70aefb46` on `main`
**Workspace:** shared Windows checkout, Git remote `origin`; not Codex Cloud execution.
**Rule:** a gate is VERIFIED only from evidence on the resulting commit. Existing edits/untracked files are preserved unless deliberately reviewed and included.

## Gate status

| Gate | Status | Evidence / remaining work |
|---|---|---|
| A — repository preservation | VERIFIED | Reviewed completion commit `1b0c7571ec9c18019c007ca15d89d5da167dc3ea` was pushed without history rewriting. Unknown JPEGs and four historical root screenshots remain untracked and excluded; no pre-existing assets were modified or staged. |
| B — backend and database | VERIFIED for tested suite | MySQL suite 13 files / 69 tests and CI clean-schema migration/SQL validation passed on disposable databases. Cancellation/dispatch serialization and cancellation/shipment-event outbox rollback tests pass. |
| C — frontend workflows and accessibility | PARTIALLY_IMPLEMENTED | Full Playwright 4/4 passes: public landing, seeded dashboard, 14-route/details smoke with axe, and product validation/create/edit/archive. Landing/dashboard five viewport checks and serious/critical axe scans pass; screenshots were visually reviewed. Independent screen-reader review and every route at every viewport remain. |
| D — security | PARTIALLY_IMPLEMENTED | Tenant and API suites remain in regression coverage. Latest audit reports three high Prisma/deepmerge-ts findings, including `--omit=dev`; documented compatibility mitigation remains. No independent penetration test. |
| E — telemetry/realtime reliability | PARTIALLY_IMPLEMENTED | Existing outbox tests/evidence retained. Single-process Socket.IO/outbox/simulator limit documented; no cross-process adapter or worker-process recovery proof. |
| F — local deployment | IMPLEMENTED_NOT_VERIFIED | API/web Dockerfiles, Compose, Nginx proxy, internal MySQL network, volume and health checks added; Compose syntax passes. Docker Engine missing, so no image/runtime/backup-restore verification. |
| G — QA | PARTIALLY_IMPLEMENTED | Clean `npm ci`, Prisma generation, typecheck, lint, build, MySQL 69/69, Playwright 4/4 and Compose syntax pass. GitHub Actions run `41150310038` passed all configured jobs on `1b0c7571ec9c18019c007ca15d89d5da167dc3ea`. Docker image/runtime verification remains blocked by missing local Engine. |
| H — GitHub | VERIFIED for code and report commits | Code commit `1b0c7571ec9c18019c007ca15d89d5da167dc3ea` passed run `41150310038`; documentation follow-up `d1785b4a1ced7da706300a76ba5b38e507953735` passed run `41150748198`: https://github.com/karkalashivareddy/cold-chain-monitoring-system/actions/runs/41150748198. Both runs succeeded on their exact SHAs. |
| I — versioned release | BLOCKED | No release will be created while container runtime validation, the three high Prisma/deepmerge-ts advisories and independent security review remain unresolved. The final CI run passed, but not all release gates did. |

## Changes verified locally

- Shipment cancellation locks the tenant-scoped row in a serializable transaction, sharing serialization with dispatch. Timeline events now write event, audit and outbox together.
- Rollback tests cover cancellation and timeline-event outbox failure; a concurrent cancellation/dispatch test checks shipment status against batch stock.
- Seed output no longer prints passwords or device key material.
- Axe checks cover landing at 375x812, 390x844, 768x1024, 1366x768 and 1920x1080; all listed authenticated routes at desktop; dashboard at all five viewports; products at 390x844. Critical/serious findings pass after fixes. This is not a WCAG conformance claim.
- Vite copies only `apps/web/public-safe/`; the production output was checked and contains no JPEGs. Original unknown-provenance JPEGs remain untouched and excluded.
- Product management reuses the shared field-validating dialog. Browser workflow covers validation, create, edit and archive against the actual API.
- Docker Compose syntax parses. No Docker daemon is available in this workspace.

## Remaining actions and release decision

- This completion commit and its remote CI are verified as above. The Docker Engine is absent, so container build/runtime, container health, proxy operation and backup/restore drill have not been verified.
- The three high Prisma/deepmerge-ts findings remain unresolved; CI's advisory classifier passed while retaining its documented risk assessment.
- Independent security review/penetration testing, cross-process Socket.IO verification, comprehensive screen-reader testing and hosted deployment remain outstanding.
- Do not create a tag/release unless all applicable gates pass. These open gates are genuine release blockers, not claims of production readiness.
