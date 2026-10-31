# FROSTGUARD full product reassessment

**Assessment date:** 2026-10-31
**Repository:** `karkalashivareddy/cold-chain-monitoring-system`
**Live baseline:** `main` at `7bbf22e4863d5e00b768effe0976d03e1965bf4b`; fetched remote `main` matched.
**Baseline CI:** run [41151182572](https://github.com/karkalashivareddy/cold-chain-monitoring-system/actions/runs/41151182572), success on that SHA.
**Workspace:** local connected Windows checkout; Codex Cloud was not connected.
**Preservation:** pre-existing `apps/web/public/images/` JPEGs and four `docs/audit/screenshots/*` files were left untouched and are excluded from the changes in this pass.

This review concentrates on the live fleet-map data contract, core application routes and existing evidence. It is not a line-by-line external security assessment or production certification. Local modifications remain uncommitted until release checks and diff review finish.

## Findings

### FG-PR-01 — Current-position provenance could place a vehicle at its origin

- **Severity:** P0 data integrity.
- **Affected module/files:** `apps/api/prisma/schema.prisma`, `apps/api/src/modules/shipments/shipments.service.ts`, `apps/api/prisma/seed.ts`, `apps/web/src/components/shipments/RouteMap.tsx`, `apps/web/src/pages/FleetMap.tsx`.
- **Evidence:** shipment creation and dispatch populated current coordinates from warehouse origin; `FleetMapCanvas` fell back from missing current position to origin. Delivered rows could hold the destination in the same fields. The API had no position provenance or timestamp.
- **Impact:** a map marker could imply a current vehicle/GPS fix when only an endpoint or delivery state was known.
- **Implementation:** add a persisted source (`UNAVAILABLE`, `SIMULATED`, `OPERATOR_REPORTED`, `DELIVERY_CONFIRMED`) and update time; new/planned/dispatched shipments no longer acquire an origin-as-current position; map API only emits eligible, paired coordinates; fleet and detail maps omit unavailable/delivery-only markers and disclose location provenance and age. Seed demo positions are explicitly simulated.
- **Verification:** Prisma schema generation, API/web typechecks, lint, production build and API/MySQL test suite passed (70 tests across 13 files). The new test proves unavailable position through create and dispatch, then verifies operator-reported checkpoint coordinates and timestamp through the map API. The full Playwright suite passed 5/5, including map provenance disclosure and filtering.
- **Status:** VERIFIED for the implemented API contract and tested browser scope; untested coordinate edge cases remain documented follow-up.

### FG-PR-02 — Shipment risk metrics used different scopes

- **Severity:** P1 product semantics.
- **Affected modules/files:** `apps/api/src/modules/dashboard`, `apps/api/src/modules/shipments/shipments.service.ts`, `apps/web/src/pages/FleetMap.tsx`.
- **Evidence:** dashboard `activeExcursions` includes all organization OPEN excursions, while fleet-map critical count includes CRITICAL OPEN excursions linked only to plotted shipments. Dashboard `criticalIncidents` is a separate active-incident count. These figures are not expected to match.
- **Impact:** similar but different labels could suggest a data inconsistency or conceal scope.
- **Implementation:** fleet label and hint now explicitly identify shipment-linked open critical excursions in the currently filtered view; dashboard semantics remain separate and are not forced to match.
- **Verification:** source query scopes inspected; browser checks validate label presence. Aggregate fixture reconciliation beyond existing analytics/API tests remains a follow-up.
- **Status:** PARTIALLY_IMPLEMENTED.

### FG-PR-03 — Map styling and provider were not production-qualified

- **Severity:** P2 presentation and service dependency.
- **Affected modules/files:** `apps/web/src/components/shipments/RouteMap.tsx`, `apps/web/src/styles.css`, `apps/api/src/app.ts`.
- **Evidence:** Leaflet raster tiles were inverted globally in CSS; source was public OSM tiles, which have a best-effort public-service policy and require attribution/caching compliance.
- **Impact:** tile colors were distorted and production tile availability/usage expectations were not clearly represented.
- **Implementation:** retain Leaflet; remove the global tile filter; keep the standard OSM endpoint only for local/demo use with visible attribution and browser Referer support. CARTO currently requires a registered key, which is not configured. Mark route lines as direct geographic connections, not road routing.
- **Verification:** build passed; browser map suite is running. No provider load/performance comparison or provider SLA has been established. See `MAP_ENGINEERING_DECISION.md`.
- **Status:** IMPLEMENTED_NOT_VERIFIED for live tile loading and provider terms review.

### FG-PR-04 — Product-facing profile and visual semantics were incomplete

- **Severity:** P2 portfolio clarity and UX.
- **Affected modules/files:** `apps/web/src/pages/Landing.tsx`, `apps/web/src/styles.css`.
- **Evidence:** the landing page lacked an owner section; the tagline differed from the current requested product identity; repeated theme values were not expressed as a semantic layer. The public landing card displayed a demo password.
- **Impact:** unclear project ownership, less consistent product language, and unnecessary public credential disclosure.
- **Implementation:** add a subdued verified creator/education/profile section; apply the supplied tagline; remove the password from the public landing page while retaining seeded demo login flow; establish Arctic Graphite / Polar Cyan / Glacier Teal semantic tokens, selected glass utility classes and broad reduced-motion overrides.
- **Verification:** production build passes; landing screenshots and accessible link review remain pending.
- **Status:** IMPLEMENTED_NOT_VERIFIED.

### FG-PR-05 — Test and release evidence did not yet cover new provenance behavior

- **Severity:** P1 verification gap.
- **Affected modules/files:** `apps/api/tests/shipments.test.ts`, `apps/web/e2e/critical-workflows.spec.ts`, audit documentation.
- **Evidence:** earlier suites had shipment inventory/lifecycle tests but no explicit origin-fallback regression. Existing route smoke loaded the map route but did not exercise map position filters, location labeling or selected shipment navigation.
- **Impact:** risk of reintroducing false current-location markers.
- **Implementation:** add API/MySQL create→dispatch→checkpoint source regression and a browser workflow for unavailable/simulated positions, filters, selection, navigation and mobile reflow.
- **Verification:** API 70/70 passed; browser workflow is being run against local Vite and seeded API. No final remote CI run exists for this local change yet.
- **Status:** PARTIALLY_IMPLEMENTED until browser and CI results are recorded.

## Existing verified baseline strengths

- React 19/Vite/Tailwind 4 application already has lazy-loaded operational routes; it is preserved.
- Express/Prisma/MySQL API has organization scoping, RBAC, transactional outbox and MySQL integration suites.
- Baseline typecheck/lint/build/test/Playwright/axe evidence is recorded in `RELEASE_CANDIDATE_REPORT.md`; that evidence is tied to earlier commits, not automatically applicable to this worktree.
- The current baseline CI run is successful on the fetched main SHA; local changes require their own CI run after push.

## Unclosed release risks

| Severity | Affected scope | Evidence and impact | Required work / verification | Status |
|---|---|---|---|---|
| P0/P1 | Tenant security, transaction injection, lifecycle permissions | Existing suites cover important cases but not the complete endpoint-by-endpoint matrix or every transaction boundary. | Continue matrix audit and injected-failure/concurrency tests in `TECHNICAL_DEBT.md`. | PARTIALLY_IMPLEMENTED |
| P1 | Prisma dependency path | Prior full and production-only audit report three HIGH advisories through Prisma config / `deepmerge-ts`; no safe compatible patch verified. | Re-audit lockfile and keep exact residual until compatible tested resolution. | PARTIALLY_IMPLEMENTED |
| P1 | Socket.IO topology | Adapter and outbox worker are process-local. | Enforce single instance or prove shared adapter with multi-process tests. | PARTIALLY_IMPLEMENTED |
| P2 | Deployment | Docker Compose configuration exists, but host has no Docker Engine. | Compose syntax does not prove image/runtime behavior; verify in Docker-capable environment. | BLOCKED |
| P2 | Accessibility | Prior axe coverage is selective and does not constitute WCAG conformance. | Run new map/landing checks and manual keyboard/zoom review; record scope. | PARTIALLY_IMPLEMENTED |
| P2 | External assessment and hosted production | No independent penetration test, provider agreement, production environment or backup/restore drill. | Do not claim production readiness absent authorization and external evidence. | NOT_IMPLEMENTED |
