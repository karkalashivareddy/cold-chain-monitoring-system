# Fleet map engineering decision

**Date:** 2026-10-31
**Decision:** Keep the existing Leaflet + React-Leaflet architecture; retain standard OpenStreetMap raster tiles as a development/demo default. Do not migrate to MapLibre or use a CARTO endpoint without a registered key and an owner-approved provider configuration.
**Affected modules:** `apps/web/src/components/shipments/RouteMap.tsx`, `apps/web/src/pages/FleetMap.tsx`, `apps/web/src/pages/ShipmentDetail.tsx`, `apps/web/src/styles.css`, `apps/api/src/app.ts`.

## Findings and decision record

### FG-MAP-01 — Engine migration has no demonstrated value at current scale

- **Severity:** P2 architecture/performance.
- **Affected files:** Fleet map/route map components and `package.json`.
- **Evidence:** existing application already uses Leaflet; the current production build emits a lazy map chunk of 158.10 kB minified / 46.63 kB gzip. Current shipment list is API-bounded by normal dataset size and has no evidence of high-volume vector rendering needs. No MapLibre prototype, comparative runtime benchmark, WebGL device survey or vector style/provider is present.
- **Impact:** adding MapLibre without data scale or a tile/style source would increase code and provider complexity without evidence it solves a current need.
- **Implementation:** retain Leaflet. Keep map boundary in `RouteMap.tsx`; all map route modules are already lazy-loaded by `App.tsx`.
- **Verification:** production build succeeded and map chunk measurement is recorded. No comparative prototype was run, so this is a conservative evidence-based decision, not a performance superiority claim.
- **Status:** VERIFIED for current choice; comparative MapLibre benchmark NOT_IMPLEMENTED.

### FG-MAP-02 — Origin fallback falsely represented vehicle presence

- **Severity:** P0 data integrity.
- **Affected files:** shipment service/model and both map components.
- **Evidence:** API creation/dispatch wrote origin into current coordinates, and map client substituted origin when `current` was null.
- **Impact:** a known endpoint could appear as current GPS.
- **Implementation:** persist explicit position source/time; clear new planned/dispatched current positions; map endpoint only returns supported current sources; no origin fallback; detail UI calls missing location unavailable. Delivery-confirmed destination is not used as a current vehicle fix. Synthetic seed positions are source-marked `SIMULATED`.
- **Verification:** API/MySQL regression passed as part of 70/70 tests. Browser test added for source and unavailable status; the E2E run is tracked in release log.
- **Status:** API invariant and tested browser disclosure VERIFIED for the covered workflows; exhaustive device/position cases remain untested.

### FG-MAP-03 — Straight lines were at risk of being interpreted as actual road routes

- **Severity:** P1 data semantics.
- **Affected files:** `RouteMap.tsx`, `FleetMap.tsx`, `ShipmentDetail.tsx`.
- **Evidence:** map has no route geometry or historical GPS polyline contract; it only has origin, destination and optional current point.
- **Impact:** drawing endpoints alone as a route can imply road routing and actual travel path.
- **Implementation:** line is dashed and labeled “direct geographic connection, not road route”; no interpolated path/progress geometry is generated. Vehicle markers are separate and sourced.
- **Verification:** copy and browser assertions added; pending browser completion.
- **Status:** VERIFIED for the tested workflow; broader route geometry remains unsupported.

### FG-MAP-04 — Public raster tile services have distinct policies

- **Severity:** P2 operational/service dependency.
- **Affected files:** `RouteMap.tsx`, API Helmet configuration, deployment docs.
- **Evidence:** OSM Foundation's [tile usage policy](https://operations.osmfoundation.org/policies/tiles/) says `tile.openstreetmap.org` is best effort without an SLA, requires visible attribution and browser Referer, and prohibits bulk/prefetch use. CARTO's [basemap key page](https://carto.com/basemaps/apikey/) (reviewed 2026-10-31) now requires a registered key and states attribution and use tiers; a project key is not configured. Its [terms](https://carto.com/legal/basemap-terms/index.html) are provider-specific.
- **Impact:** a no-key CARTO URL would ignore the current key requirement, while OSM standard tiles cannot be treated as an unlimited production CDN.
- **Implementation:** keep standard OSM only for development/demo, show visible attribution, remove tile inversion, and set `strict-origin-when-cross-origin` so the browser sends origin-level Referer cross-origin. No prefetch is implemented. Production provider selection remains configuration/operations work.
- **Verification:** attribution exists in the Leaflet layer; Helmet policy typechecks/builds. Actual tile response in browser and production provider configuration are unverified.
- **Status:** IMPLEMENTED_NOT_VERIFIED for provider/runtime use; production map provider NOT_IMPLEMENTED.

## Current map behavior

- `GET /api/v1/shipments/map` scopes shipment, excursion and sensor queries by authenticated `orgId` and omits cancelled shipments.
- Origin/destination are endpoint records, not vehicle positions.
- Current position is returned only for `SIMULATED` or `OPERATOR_REPORTED` when both coordinate values exist. `UNAVAILABLE` and `DELIVERY_CONFIRMED` never become a live marker.
- Position source and last-update timestamp are returned separately from sensor telemetry's `isSimulated` state.
- Selected shipment/list selection, search, status filter, excursion severity filter, position availability filter, 30-second API polling and manual refresh are implemented.
- Route line is direct origin-to-destination, dashed, and explicitly not a road route. There are no fabricated route-history points or movement interpolation.
- Existing Leaflet zoom controls are retained. Selected-list focus uses endpoint/current bounds; map selection changes the linked panel.
- No clustering, fullscreen, style selector, origin/destination marker controls, real-time socket map mutation, tile-error illustration or GPS-staleness threshold is implemented. These are not claimed as complete.
- Current demo positions are synthetic. API does not yet ingest vendor/GPS hardware location payloads; operator checkpoint is the only non-simulated position writer currently in view.

## Provider and production policy

OSM attribution is shown in the Leaflet control and public attribution link. Browser cache behavior is left to provider HTTP headers; there is no tile prefetch. The map is a development/demo convenience until the owner selects a provider/service plan or self-hosting strategy and verifies applicable terms, capacity, Referer/CSP behavior and availability. No paid provider, key or cloud service was provisioned.

## Open follow-up

| Severity | Finding | Affected | Evidence / impact | Implementation and verification needed | Status |
|---|---|---|---|---|---|
| P1 | No hardware GPS pipeline | device/telemetry contracts | No source data supports a live GPS marker. | Add authenticated location event contract, ordering, freshness semantics and tenant/vehicle tests only when a real data source is specified. | NOT_IMPLEMENTED |
| P2 | No GPS freshness classification | API map contract / map legend | Timestamp exists, but no product-approved stale threshold. | Agree a freshness SLO and test boundary before using “stale”. | NOT_IMPLEMENTED |
| P2 | No clustering at low zoom | Fleet map | Marker count/scale has no measured issue yet. | Add only after representative scale/performance test demonstrates need. | NOT_APPLICABLE currently |
| P2 | Tile failure fallback and screenshot inspection | RouteMap / E2E | External tile service availability is not deterministic. | Add tile-error state and inspect real browser screenshots against source data. | PARTIALLY_IMPLEMENTED |
