# CI validation notes

**Date:** 2026-10-30\
**Workflow:** `.github/workflows/ci.yml`\
**Status:** remote run 41098318439 passed migrations, SQL controls, typecheck, lint and build, then test global setup failed because its nested SQL script lacked JWT configuration. Test-only JWT values are now supplied to both migration and integration-test steps; a rerun is required.

## Workflow checks observed

The local workflow defines a single Ubuntu job with a MySQL 8.4 service and health check. It checks out source, uses Node 22 with npm cache, performs `npm ci`, generates Prisma client, applies migrations and SQL controls to `frostguard_test`, then runs typecheck, lint, production build, MySQL integration tests, installs Chromium and starts the compiled API before running the Playwright suite. An npm lockfile audit report is classified by `scripts/check-audit.mjs`.

The workflow uses only local test credentials in its test job environment. It does not deploy, push artifacts, or require personal production credentials. The integration test setup resets `frostguard_test`; the workflow creates this database as an isolated MySQL service for the job.

## Validation status

- Local equivalents: typecheck, lint, build, 56 MySQL tests and all 3 Playwright tests passed on the recorded Windows host; fresh additive migration validation passed separately.
- CI syntax: local `js-yaml` parse passed and found the expected `validate` job. `actionlint` and GitHub's workflow schema validation were not available locally.
- Remote Actions: run `41097058923` (SHA `50c8562`) failed because root had no `db:deploy`. Run `41097660298` (SHA `beccc57`) applied migrations then failed because migration-time SQL controls lacked app JWT environment. Run `41098318439` (SHA `d35124b`) passed migration, SQL, typecheck, lint and build, then test global setup's nested `apply-sql.ts` failed for the same missing JWT values. The workflow now supplies `NODE_ENV=test` and test-only JWT placeholders to both steps. Local fresh-schema migration/SQL validation passed with these values; push and record the next complete remote result.
- Dependency audit step: classifies runtime findings; the raw audit still exits nonzero for high development/optional Prisma tooling advisories. Review `docs/security/DEPENDENCY_ADVISORY_ASSESSMENT.md` before considering the security gate closed.

## Follow-up

After publication, confirm GitHub Actions discovers the workflow and inspect the first run's exact job logs. Keep a real run URL/ID and conclusion in the release report. Do not represent local validation as remote CI execution.
