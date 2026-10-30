# Implementation roadmap

**Reassessed:** 2026-10-30\
**Execution owner:** Codex.\
**Baseline report:** PHASE_01_REPOSITORY_REASSESSMENT.md.\
**Policy:** preserve all existing user work; no commit/push, history edits, deployment, or paid services. Each gate requires evidence before moving forward.

## Phase 1 gate — Repository truth (complete)

Inventory and inspect Git identity/status/history, workspaces and dependencies, web routes, API modules, schema/migrations/SQL, integration tests, CI, docs/assets, and current runtime evidence.

Evidence: typecheck, lint, production build, 7 API/MySQL suites / 35 tests passed. Local Vite browser probe found a fatal named-export error preventing page render. Two organization-scoped temperature profile write gaps were found. Full inventory and evidence are in PHASE_01_REPOSITORY_REASSESSMENT.md.

## Phase 2 gate — Requirements and work plan (complete)

Updated FEATURE_COMPLETION_MATRIX.md and TECHNICAL_DEBT.md to use required status labels, owner, priority, dependencies, acceptance criteria and test procedures. Critical current implementation targets:

1. P0: browser module runtime failure and regression coverage.
2. P0: tenant-scoped profile assignment for product/batch writes.
3. P0: continue auditing cross-tenant references (profile and maintenance sensor references are fixed), telemetry ordering, transaction rollback/concurrency and clean-schema migrations.
4. P1: reliable outbox delivery, socket authorization, and workflow edge tests.
5. P1: dependency advisory reassessment.
6. P2: visual/accessibility review, bundle measurement, operational/deployment readiness, asset provenance.
7. Blocked: remote CI verification, external Claude review, hosted deployment and penetration test remain honestly blocked/not implemented unless independently enabled.

## Phase 3 — Domain and business-rule validation (P0)

Owner: Codex. Dependency: existing researched domain sources in docs/research/DOMAIN_RESEARCH.md.

- Map product profiles, persistence windows, excursion/recovery semantics, late readings, device health/calibration, batch disposition and shipment stock lifecycle to actual code.
- Decide and document delayed/out-of-order telemetry effects before changing excursion state.
- Verify no code automatically marks a batch safe/spoiled from telemetry; disposition remains authorized human action.
- Record source URLs and research dates, distinguish actual from synthetic readings/location.

Acceptance: domain decision table matches code and deterministic tests; no unsupported product safety or regulatory claims.

## Phase 4 — P0 runtime and tenant integrity

Owner: Codex. Dependencies: none for backend; browser runtime fix enables UI verification.

1. Correct shared package browser module resolution while preserving Node API CommonJS output.
2. Add Playwright browser smoke for public route; verify Vite dev and production preview at desktop/mobile sizes.
3. Scope profile IDs on product create/update and batch create/update; test rejected cross-org writes and same-org updates.
4. Continue auditing remaining cross-tenant write relations (selected product, batch, maintenance and device assignment paths now have regression coverage).

Acceptance evidence so far: dev and preview landing page render without page errors; authenticated dashboard smoke renders against the compiled API and disposable test DB; landing and dashboard desktop/mobile screenshots were captured and inspected; cross-org product/batch profile IDs and maintenance sensor IDs are rejected without mutation; same-org writes succeed; 40 MySQL tests, typecheck, lint and production build pass. A two-shipment stock race returns one successful dispatch and one HTTP 409 after retrying a MySQL deadlock. Remaining item: complete relation audit and verify other authenticated routes.

## Phase 5 — P0 database, transactions, and backend correctness

Owner: Codex. Dependencies: Phase 4 profile tests and isolated MySQL.

- Validate committed Prisma migration and SQL assets against clean disposable MySQL (not only db push).
- Review tenant relations, FK/unique/check constraints, indexes and query plans.
- Add failure injection/rollback checks for telemetry/excursion/alert/audit/outbox, incident resolution and shipment dispatch.
- Test release/cancel semantics according to current lifecycle and inject failures after stock changes.
- Define late/out-of-order telemetry semantics; prevent stale values from regressing live state.
- Validate assignment and device status inside a suitable transaction/locking boundary.

Acceptance: migration succeeds from clean schema; rollback leaves no partial writes; concurrency tests preserve stock, excursion and event invariants; historical telemetry remains immutable.

## Phase 6 — P0 security and dependency assessment

Owner: Codex. Dependencies: tenant relation inventory.

- Complete resource/object authorization matrix, including profile IDs and realtime organization subscriptions.
- Verify credential revocation/rotation, session expiry, device replay boundaries, safe logs and production env validation.
- Refresh lockfile audit; classify production vs development paths and decide supported remediation without forced major upgrade.
- Record residual risks, affected version/path and mitigation.

Acceptance: no unassessed critical/high issue; cross-tenant regressions pass; all dependency changes validated by tests/build.

## Phase 7 — P1 outbox and operational workflows

Owner: Codex. Dependencies: transaction semantics and schema migration strategy.

- Implement reliable outbox lease/claim or enforce a single worker; stable event ID, retries and restart recovery.
- Test sockets for authentication, organization isolation, revocation/reconnect, cleanup and event reconciliation.
- Complete alert escalation/ack/resolution and incident evidence, disposition, actor, reason and audit behavior.
- Verify shipment create/dispatch/delivery/cancel and stock consistency across competing shipments.

Acceptance: events publish only after commit; worker restart recovers pending work; domain state and audit history agree after all tested transitions.

## Phase 8 — P1 front-end quality and product experience

Owner: Codex. Dependency: Phase 4 runtime fix and real API.

- Verify routes and important controls with real API behavior; no fake metrics/locations.
- Ensure actual/simulated telemetry and GPS availability/freshness are clear.
- Add accessible loading/error/empty/form states, focus management and responsive tables/maps.
- Review public site language and licensed asset provenance; no unsupported certifications/customer/deployment claims.

Acceptance: smoke/workflow browser tests pass, keyboard interactions work, no dead primary controls, and route data reconciles with API fixtures.

## Phase 9 — P2 performance, accessibility, observability

Owner: Codex. Dependencies: stable UI runtime.

- Capture bundle baseline then split/lazy-load heavy chart/map routes where beneficial.
- Measure available Core Web Vitals/API query performance and document methodology.
- Perform viewport review at 375x812, 390x844, 768x1024, 1366x768, 1920x1080.
- Verify structured log redaction, request correlation, health/readiness, graceful shutdown and operator recovery steps.

Acceptance: comparable before/after metrics recorded; no feature regression; major accessibility/performance defects fixed or individually tracked.

## Phase 10 — P2 deployment and developer experience

Owner: Codex. Dependencies: production env policy and migration strategy. No deployment/paid resources without separate authorization.

- Add a safe reproducible local deployment path or document managed architecture; private MySQL, placeholder env values, health checks, non-root processes where practical and HTTPS termination guidance.
- Add migration, rollback, backup/restore, secret rotation and troubleshooting procedures.
- Reconcile README, API docs, architecture/database docs, security and audit records.
- Verify licenses/provenance for shipped imagery or remove/replace unclear assets when possible.

Acceptance: a clean disposable environment can follow instructions and pass smoke checks; actual hosting remains NOT_IMPLEMENTED unless deployed with authorization.

## Phase 11 — independent and release-candidate audit

Owner: Codex; external review only when credentials are available and safe.

- Re-run all automated validation from clean installation where feasible, plus migration, security, bundle and browser checks.
- Request independent review only when authenticated; otherwise status stays BLOCKED.
- Produce release-candidate, final visual, technical, security and performance reports with command/result/time/environment/failure details.
- Fix P0; assess every P1 and retain evidence for dispositions.

Acceptance: no unresolved P0 and no unassessed P1. A blocked remote review/deploy is documented, not represented as done.

## Execution record

| Phase | Status | Evidence |
|---|---|---|
| 1 Repository reassessment | VERIFIED | docs/audit/PHASE_01_REPOSITORY_REASSESSMENT.md; current commands and runtime probe |
| 2 Completion plan | VERIFIED | This roadmap, FEATURE_COMPLETION_MATRIX.md, TECHNICAL_DEBT.md |
| 3 Domain validation | PARTIALLY_IMPLEMENTED | Policy mapping covers product profiles, human disposition, simulated provenance and late sequence behavior; calibration/data-gap policy and broader source mapping remain |
| 4 Runtime and tenant integrity | PARTIALLY_IMPLEMENTED | Browser resolution, authenticated dashboard smoke, product/batch profile and maintenance-sensor tenant checks verified; remaining relation audit and other authenticated routes are outstanding |
| 5 Database and backend correctness | PARTIALLY_IMPLEMENTED | Fresh disposable MySQL migration plus all 34 SQL controls applied; 40 integration tests pass including competing shipments and concurrent incident resolution; transaction rollback and cancellation gaps remain |
| 6 Dependency audit | PARTIALLY_IMPLEMENTED | Vitest patched to 4.1.12; lockfile audit leaves high findings only in Prisma CLI/config/deepmerge-ts dev tooling; Prisma 7 major remains unperformed |
| 7–11 | PARTIALLY_IMPLEMENTED | P1 outbox, realtime, full operational UX, accessibility, deployment and independent review remain open; bundle splitting, selected browser QA, reports and security review are documented. Complete remaining workflow and release gates before claiming phase completion. |
