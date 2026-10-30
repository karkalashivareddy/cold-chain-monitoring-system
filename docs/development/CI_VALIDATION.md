# CI validation notes

**Date:** 2026-10-30\
**Workflow:** `.github/workflows/ci.yml`\
**Status:** local workflow source parses; remote run 41097058923 exposed a root-script path defect at migration validation. The workspace command was corrected and a clean disposable schema passed locally; a follow-up remote run is required.

## Workflow checks observed

The local workflow defines a single Ubuntu job with a MySQL 8.4 service and health check. It checks out source, uses Node 22 with npm cache, performs `npm ci`, generates Prisma client, applies migrations and SQL controls to `frostguard_test`, then runs typecheck, lint, production build, MySQL integration tests, installs Chromium and starts the compiled API before running the Playwright suite. An npm lockfile audit report is classified by `scripts/check-audit.mjs`.

The workflow uses only local test credentials in its test job environment. It does not deploy, push artifacts, or require personal production credentials. The integration test setup resets `frostguard_test`; the workflow creates this database as an isolated MySQL service for the job.

## Validation status

- Local equivalents: typecheck, lint, build, 56 MySQL tests and all 3 Playwright tests passed on the recorded Windows host; fresh additive migration validation passed separately.
- CI syntax: local `js-yaml` parse passed and found the expected `validate` job. `actionlint` and GitHub's workflow schema validation were not available locally.
- Remote Actions: run `41097058923` for pushed SHA `50c856200ebcaeda9acdb1960785e5bbb663c75d` failed at `Validate clean-schema migrations and SQL controls`: root had no `db:deploy` script. Workflow now calls `npm run db:deploy -w @frostguard/api && npm run db:sql -w @frostguard/api`. The exact corrected sequence applied both migrations and four SQL control files to disposable `frostguard_ci_migration_test`; push this follow-up and record its remote result.
- Dependency audit step: classifies runtime findings; the raw audit still exits nonzero for high development/optional Prisma tooling advisories. Review `docs/security/DEPENDENCY_ADVISORY_ASSESSMENT.md` before considering the security gate closed.

## Follow-up

After publication, confirm GitHub Actions discovers the workflow and inspect the first run's exact job logs. Keep a real run URL/ID and conclusion in the release report. Do not represent local validation as remote CI execution.
