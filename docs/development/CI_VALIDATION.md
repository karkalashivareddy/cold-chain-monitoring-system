# CI validation notes

**Date:** 2026-10-30\
**Workflow:** `.github/workflows/ci.yml`\
**Status:** VERIFIED remotely. Run `41098761499` for SHA `4237f09` completed successfully.

## Workflow checks observed

The local workflow defines a single Ubuntu job with a MySQL 8.4 service and health check. It checks out source, uses Node 22 with npm cache, performs `npm ci`, generates Prisma client, applies migrations and SQL controls to `frostguard_test`, then runs typecheck, lint, production build, MySQL integration tests, installs Chromium and starts the compiled API before running the Playwright suite. An npm lockfile audit report is classified by `scripts/check-audit.mjs`.

The workflow uses only local test credentials in its test job environment. It does not deploy, push artifacts, or require personal production credentials. The integration test setup resets `frostguard_test`; the workflow creates this database as an isolated MySQL service for the job.

## Validation status

- Local equivalents: typecheck, lint, build, 56 MySQL tests and all 3 Playwright tests passed on the recorded Windows host; fresh additive migration validation passed separately.
- CI syntax: local `js-yaml` parse passed and found the expected `validate` job. `actionlint` and GitHub's workflow schema validation were not available locally.
- Remote Actions: run `41098761499` for SHA `4237f09b4eaf0e34d5b1707d6f58fe4df69fad4b` completed successfully. Migration/SQL, typecheck, lint, build, MySQL integration tests, Chromium install, browser tests, and dependency advisory classification all passed. Earlier runs exposed script and test-environment issues, which are corrected in the passing commit. GitHub annotated Node.js 20 action deprecation and `ubuntu-latest` migration warnings; these did not fail the run.
- Dependency audit step: classifies runtime findings; the raw audit still exits nonzero for high development/optional Prisma tooling advisories. Review `docs/security/DEPENDENCY_ADVISORY_ASSESSMENT.md` before considering the security gate closed.

## Follow-up

Future workflow edits should be validated by inspecting the actual remote run and recording its ID, SHA and conclusion. Do not represent local validation as remote CI execution.
