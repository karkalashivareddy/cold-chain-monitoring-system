# UI / UX gap analysis

**Date:** 2026-10-31
**Scope:** existing React 19 application, with detailed review of Landing, FleetMap, RouteMap, ShipmentDetail, shared theme CSS and authenticated navigation. The full route suite is documented separately; this is not a claim that every page was manually reviewed at every viewport.

## Findings

### FG-UX-01 — Map implied live positions for shipments without GPS

- **Severity:** P0 data presentation.
- **Affected file/module:** `apps/web/src/components/shipments/RouteMap.tsx`; shipment map contract/API.
- **Evidence:** fleet map rendered `shipment.current ?? shipment.origin` as one vehicle marker.
- **Impact:** users could mistake a warehouse coordinate for a current vehicle position.
- **Implementation:** only render `current` when API provenance permits it; origin/destination remain endpoints; panel/list distinguish simulated position, operator-reported checkpoint, timestamp and unavailable state.
- **Verification:** 70 API/MySQL tests passed including the provenance invariant; full Playwright suite passed 5/5 including map position source and unavailable states.
- **Status:** VERIFIED for the covered behavior; exhaustive GPS input cases remain untested.

### FG-UX-02 — Filters and shipment selection needed a clearer operational loop

- **Severity:** P1 workflow usability.
- **Affected file/module:** `apps/web/src/pages/FleetMap.tsx`.
- **Evidence:** fleet view had status filtering, but no query field, risk/location filter, and selecting a list record did not change map focus.
- **Impact:** finding an exception among shipments and moving between list/map context took unnecessary effort.
- **Implementation:** add destination/code/status search, status filter, open/critical excursion and location-availability filters; list selection fits the selected shipment bounds; map markers synchronize selected detail panel.
- **Verification:** E2E added for selecting SHP-0002, unavailable-location behavior, filtering, deep-link and 390×844 overflow.
- **Status:** VERIFIED for the tested search/filter/selection workflow.

### FG-UX-03 — Map risk and telemetry cues were visually underspecified

- **Severity:** P2 data interpretation.
- **Affected file/module:** `apps/web/src/pages/FleetMap.tsx` and `RouteMap.tsx`.
- **Evidence:** legend used informal color labels; telemetry and current location provenance were conflated in summary wording; routes were straight origin/destination lines.
- **Impact:** could imply road routing or make simulated location indistinguishable from simulated sensor data.
- **Implementation:** semantic legend, distinct location and sensor provenance labels, honest direct-line disclosure, no interpolated track and no fake marker.
- **Verification:** browser text assertions and no-console-error check passed in the full Playwright run.
- **Status:** VERIFIED for the tested map workflow.

### FG-UX-04 — Basemap and theme competed

- **Severity:** P2 visual quality.
- **Affected file/module:** `apps/web/src/styles.css`, `RouteMap.tsx`.
- **Evidence:** global raster tile inversion modified all map pixels, making cartographic color control and tile semantics unpredictable.
- **Impact:** inconsistent map contrast and an unfinished appearance.
- **Implementation:** remove global invert so tile data remains truthful; use the existing standard OSM endpoint for local/demo, with attribution and the required browser Referer behavior. A dark hosted basemap needs a registered provider key and an approved production configuration. Introduce semantic palette aliases and small set of glass utilities.
- **Verification:** production bundle passed and fresh screenshots show the actual provider failure state; the browser test forces tile failure and confirms disclosure. This host could not load external OSM tiles.
- **Status:** PARTIALLY_IMPLEMENTED; local failure handling verified, production tile service remains unconfigured.

### FG-UX-05 — Landing page lacked creator context and exposed demo password

- **Severity:** P2 repository presentation/security hygiene.
- **Affected file/module:** `apps/web/src/pages/Landing.tsx`.
- **Evidence:** creator education/profile was absent; demo card rendered a password in public markup.
- **Impact:** portfolio ownership was not clear, and credentials were unnecessarily displayed.
- **Implementation:** add understated profile with only user-provided education/public links and remove password display; use demo sign-in button instead.
- **Verification:** full Playwright landing/axe workflow passed across its configured viewport set; fresh landing screenshot captured. Public links match the owner-provided URLs.
- **Status:** VERIFIED for implementation and tested browser scope.

### FG-UX-06 — Reduced-motion coverage was limited

- **Severity:** P2 accessibility.
- **Affected file/module:** `apps/web/src/styles.css`.
- **Evidence:** reduced-motion overrides targeted a few project animation classes and hover movement, while transitions elsewhere remained.
- **Impact:** OS reduced-motion preference was not consistently respected.
- **Implementation:** global reduced duration/scroll behavior override; existing animation classes still explicitly stop and interactive elevation is removed.
- **Verification:** reduced-motion emulation is covered by the landing Playwright test and passed. Manual assistive-technology review remains open.
- **Status:** VERIFIED for CSS behavior exercised in browser; manual review remains open.

## Retained constraints / follow-up

- Keep the existing shell, route hierarchy and React application; no replacement UI was introduced.
- Map uses a raster tile provider, so its palette is provider-defined. A provider outage yields an unattractive/blank basemap; an explicit tile-error illustration is not yet implemented.
- Fresh local application screenshots are captured under `screenshots/release-candidate-20261031-final/`; the map image truthfully shows the provider failure state.
- The app contains large chart chunk (409.19 kB minified / 115.44 kB gzip), but route lazy loading already separates charts and map. No feature removal is proposed.
- Prior axe checks passed critical/serious issues over documented scope; no full WCAG 2.2 AA conformance claim is made.
