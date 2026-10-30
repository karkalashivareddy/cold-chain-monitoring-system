# Technical Audit (Reconciled After P0 Fixes)

**Date:** 2026-10-30

## Verified

- Repository identity, branch and pre-existing dirty/untracked work were inspected and preserved.
- `npm.cmd run typecheck` passed.
- `npm.cmd run build` passed for shared code, API and web.
- Historical baseline: six API/MySQL integration files (33 tests), then 7 files / 40 tests. Superseding Phase 24 validation passed 12 files / 56 tests; see `docs/audit/RELEASE_CANDIDATE_REPORT.md`.
- Web dev server served HTTP 200 at `/`.
- API development server startup could not be verified: `tsx watch` failed before app startup with Node `uv_os_get_passwd returned ENOMEM`; API routes were exercised by the integration suite instead.
- GitHub Actions CI, ESLint flat config and production secret guards were added during this audit.
- Feature and transaction evidence is recorded in `docs/audit/FEATURE_COMPLETION_MATRIX.md` and `docs/database/TRANSACTION_DESIGN.md`.

## Reassessment after the initial audit

- The browser shared-package runtime issue is fixed by browser-only Vite source resolution; API continues to use the compiled shared package. Playwright Chromium smoke passed against Vite development and production preview.
- Product and batch temperature-profile references are tenant-checked in write transactions. Storage-unit maintenance sensor IDs are tenant-checked in the maintenance write transaction. The current 40-test MySQL suite covers rejected cross-organization references and accepted same-organization writes.
- Telemetry serializes per-sensor ingestion and assignment changes with a sensor row lock, marks lower-sequence readings as historical without changing live excursion/alert state, and derives simulated provenance from trusted internal simulator context. Regression tests pass.
- Superseding Phase 24 validation: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`, and `npm.cmd test` pass; API suite is 12 files / 56 tests on disposable `frostguard_test`; build entry is 498.23 kB minified (152.10 kB gzip). See `docs/audit/RELEASE_CANDIDATE_REPORT.md` and `FINAL_PERFORMANCE_AUDIT.md`.
- A fresh disposable MySQL schema accepted the initial Prisma migration and all 34 statements in the four SQL control files. The repository `db:sql` wrapper remains blocked on this Windows host by `tsx` `uv_os_get_passwd returned ENOMEM`; SQL was applied with the existing mysql2 driver without touching `frostguard` or `frostguard_test` during that migration check.
- Playwright screenshots exist and were inspected for the public landing and authenticated dashboard at 1366x768 and 390x844. The dashboard ran against the compiled API and disposable MySQL test database; other authenticated routes remain unverified.
- Historical initial audit note: the workflow was absent from the remote default branch at that time. It was later pushed and GitHub Actions run `41098761499` passed for SHA `4237f09b4eaf0e34d5b1707d6f58fe4df69fad4b`.
- The npm audit still reports high findings in the Prisma config/deepmerge-ts dependency chain; see the dated dependency assessment and current release report for classification and residual risk. Prisma major migration remains unperformed.

The initial section above records the starting baseline. The current evidence and incomplete gates are maintained in `docs/audit/FEATURE_COMPLETION_MATRIX.md`, `docs/audit/TECHNICAL_DEBT.md`, and the release-candidate report when it is produced.

## Findings

- No Docker/Compose/Nginx existed at audit start. CI was added and remote run `41098761499` passed; deployment remains unverified.
- No frontend browser automation specs were found or run.
- Outbox uses in-process polling with no multi-process atomic claim, so horizontal scaling can duplicate publication.
- Frontend chunk size warning remains; no browser performance baseline was collected.
- No hosted deployment or runtime behavior across desktop/tablet/mobile was verified.

See [technical debt](audit/TECHNICAL_DEBT.md) and [completion report](FINAL_PROJECT_COMPLETION_REPORT.md) for detailed status.
