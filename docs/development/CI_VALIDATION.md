# CI validation notes

**Date:** 2026-10-30\
**Workflow:** `.github/workflows/ci.yml`\
**Status:** VERIFIED remotely. Run `41098761499` for SHA `4237f09` completed successfully.

## Workflow checks observed

The local workflow defines a single Ubuntu job with a MySQL 8.4 service and health check. It checks out source, uses Node 22 with npm cache, performs `npm ci`, generates Prisma client, applies migrations and SQL controls to `frostguard_test`, then runs typecheck, lint, production build, MySQL integration tests, installs Chromium and starts the compiled API before running the Playwright suite. An npm lockfile audit report is classified by `scripts/check-audit.mjs`.

The workflow uses only local test credentials in its test job environment. It does not deploy, push artifacts, or require personal production credentials. The integration test setup resets `frostguard_test`; the workflow creates this database as an isolated MySQL service for the job.

## Validation status

- Workflow source was updated after the passing run to cancel superseded runs per branch/PR, cap the job at 30 minutes, and keep the audit report in runner temporary storage. The modified YAML parses locally and the intended settings were asserted with `js-yaml`; **this workflow revision has not yet been remotely executed**. The remote PASS below applies to SHA `4237f09`, before this small workflow-only change.
- Earlier local equivalents: typecheck, lint, build, 65 MySQL tests and all 3 Playwright tests passed on the Windows host; fresh additive migration validation passed separately on the previously recorded disposable schema.
- CI syntax: local `js-yaml` parse passed and found the expected `validate` job. `actionlint` and GitHub's workflow schema validation were not available locally.
- Remote Actions: run `41098761499` for SHA `4237f09b4eaf0e34d5b1707d6f58fe4df69fad4b` completed successfully. Migration/SQL, typecheck, lint, build, MySQL integration tests, Chromium install, browser tests, and dependency advisory classification all passed. Earlier runs exposed script and test-environment issues, which are corrected in the passing commit. GitHub annotated Node.js 20 action deprecation and `ubuntu-latest` migration warnings; these did not fail the run.
- Dependency audit step: reports high findings on lockfile entries marked dev/devOptional; the raw audit and `--omit=dev` audit still show the Prisma/deepmerge-ts advisory path. Review `docs/security/DEPENDENCY_ADVISORY_ASSESSMENT.md`; the residual is not closed.

## Follow-up

Future workflow edits should be validated by inspecting the actual remote run and recording its ID, SHA and conclusion. Do not represent local validation as remote CI execution.

## Current main update — 2026-10-31

API docs, CSV safety, accessible mobile navigation, and CI audit wording were pushed directly to main at `e11a5eb`. GitHub Actions run `41108491962` failed the mobile landing-page link interaction; its authenticated dashboard and 14-route smoke passed. The menu was laid out inside a horizontal flex row, placing the link outside the clickable viewport in Linux Chromium. The nav now renders below the row. The corrected main commit `4afca15c3b7555ac59f0f42a0c0b42a299b0e1fc` passed run `41109670804`; the pre-fix direct-push run `41109115088` failed the same interaction. PR #1 was closed unmerged per owner direction.
