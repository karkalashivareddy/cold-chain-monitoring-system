# CI validation notes

**Date:** 2026-10-30\
**Workflow:** `.github/workflows/ci.yml`\
**Status:** local workflow source parses; remote execution NOT VERIFIED until the authorized push creates a run.

## Workflow checks observed

The local workflow defines a single Ubuntu job with a MySQL 8.4 service and health check. It checks out source, uses Node 22 with npm cache, performs `npm ci`, generates Prisma client, applies migrations and SQL controls to `frostguard_test`, then runs typecheck, lint, production build, MySQL integration tests, installs Chromium and starts the compiled API before running the Playwright suite. An npm lockfile audit report is classified by `scripts/check-audit.mjs`.

The workflow uses only local test credentials in its test job environment. It does not deploy, push artifacts, or require personal production credentials. The integration test setup resets `frostguard_test`; the workflow creates this database as an isolated MySQL service for the job.

## Validation status

- Local equivalents: typecheck, lint, build, 56 MySQL tests and all 3 Playwright tests passed on the recorded Windows host; fresh additive migration validation passed separately.
- CI syntax: local `js-yaml` parse passed and found the expected `validate` job. `actionlint` and GitHub's workflow schema validation were not available locally.
- Remote Actions: not yet run; workflow is not on remote default branch at this report point. The user authorized phase-wise publication; inspect and record the actual remote run after pushing.
- Dependency audit step: classifies runtime findings; the raw audit still exits nonzero for high development/optional Prisma tooling advisories. Review `docs/security/DEPENDENCY_ADVISORY_ASSESSMENT.md` before considering the security gate closed.

## Follow-up

After publication, confirm GitHub Actions discovers the workflow and inspect the first run's exact job logs. Keep a real run URL/ID and conclusion in the release report. Do not represent local validation as remote CI execution.
