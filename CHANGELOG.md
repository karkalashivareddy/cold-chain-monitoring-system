# Changelog

Notable project changes are recorded here. This file does not imply a production release.

## Unreleased — 2026-10-30

- Added repository audit, feature completion matrix, technical debt and roadmap.
- Added cold-chain domain research and architecture/database/transaction design records.
- Added threat model, security control inventory, test results and final audit reports.
- Added ESLint flat configuration and fixes for unused imports/variables; shipment planning form now fills a default origin when asynchronous warehouse options arrive.
- Added production secret placeholder/reuse checks with validation tests.
- Added GitHub Actions validation workflow for type check, lint, build, MySQL tests and dependency audit.
- Added contributing and security policies.

## Unreleased â€” 2026-10-31

- Serialized shipment cancellation with dispatch and made shipment timeline writes transactional with audit/outbox records; added MySQL rollback and race coverage.
- Reused the shared product form with field-level validation and added a live API Playwright create/edit/archive workflow.
- Added axe-core browser checks; fixed high-impact contrast, accessible-name and loading-status findings.
- Restricted Vite's copied static assets to a project-created SVG/favicon allowlist, preserving but excluding unlicensed local JPEGs.
- Added local Docker Compose/API/web/Nginx deployment definitions and a deployment/runbook guide; Docker Engine runtime verification remains blocked on this host.
- Removed demo credentials from seed command output and made HTTP shutdown drain requests before forced connection close.
- Added 2026-10-31 local release-candidate evidence: clean install, 69 MySQL tests, 4 Playwright tests, accessibility viewports, production bundle and Docker Compose syntax. No versioned release is declared; the Prisma/deepmerge-ts advisory and runtime deployment checks remain open.
