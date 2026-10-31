# Design system specification — Arctic Signal

**Identity:** Arctic Graphite + Polar Cyan + Glacier Teal
**Tagline:** Every Degree. Every Handoff. Accounted For.
**Implementation:** `apps/web/src/styles.css` semantic `--fg-*` tokens, aliased into existing Tailwind theme names.
**Status:** Initial token and reduced-motion layer implemented; full component-by-component visual sign-off is not complete.

## Semantic palette

| Role | Token | Value | Use |
|---|---|---:|---|
| Main background | `--fg-bg` | `#07111F` | App canvas |
| Sidebar | `--fg-sidebar` | `#0A1726` | Navigation shell |
| Secondary background | `--fg-bg-secondary` | `#0D1B2A` | Page sections |
| Surface | `--fg-surface` | `#14283A` | Cards and panels |
| Raised surface | `--fg-surface-raised` | `#193247` | Selected/interactive layers |
| Border | `--fg-border` | `#23394D` | Dividers and outlines |
| Primary | `--fg-primary` | `#35C6F4` | Main action, focus, selected route |
| Secondary | `--fg-secondary` | `#27D3B0` | Healthy state, secondary accent |
| Analytics | `--fg-analytics` | `#A78BFA` | Secondary analytics series |
| Success | `--fg-success` | `#27D3B0` | Healthy/completed status |
| Warning | `--fg-warning` | `#F5B942` | Warning/open noncritical exception |
| Critical | `--fg-critical` | `#FF647C` | Critical state |
| Information | `--fg-info` | `#65BFFF` | Informational state |
| Primary text | `--fg-text` | `#E8F2FA` | Main body and headings |
| Secondary text | `--fg-text-secondary` | `#A9BDCF` | Supporting text |
| Muted text | `--fg-text-muted` | `#839BB0` | Quiet labels; adjusted for raised surfaces |
| Focus | `--fg-focus` | `#35C6F4` | Keyboard focus |

Existing Tailwind aliases (`abyss`, `deep`, `surface`, `elevated`, `line`, `ice`, `mist`, `cyan`, `teal`, `amber`, `rose`, `violet`) remain to preserve current page architecture and styles.

## Contrast evidence and limits

Relative luminance and contrast ratios were computed from the solid token values using the WCAG sRGB formula on 2026-10-31. Primary text `#E8F2FA` on the five background/surface values ranges 11.65:1–16.69:1. Secondary text `#A9BDCF` ranges 6.84:1–9.80:1. The adjusted muted text `#839BB0` is 4.58:1 on raised surface `#193247` and higher on darker surfaces. Status colors also exceed 3:1 on those solid surfaces. These calculations do **not** establish all rendered-state contrast: transparent overlays, opacity utilities, browser compositing, disabled/hover states, tile labels and chart graphics still need rendered-pixel and manual review. No WCAG conformance claim is made.

## Typography, spacing and component treatment

- Keep the existing system sans stack; no new font dependency or unlicensed font asset.
- Keep tabular numerals for KPI values and monospace for IDs/technical identifiers.
- Use the current spacing/radius/component utility conventions; avoid page-specific palette additions.
- Existing `panel` and `panel-soft` remain the normal operational surfaces.
- New glass utilities (`glass-toolbar`, `glass-panel`, `glass-popover`) are selective, high-contrast overlays with a solid translucent fallback and 14px blur; use only for floating controls/overlays.
- Preserve visible `:focus-visible` outlines; controls must not communicate status by color alone.
- Semantic chart colors should use the existing success/warning/critical/information/analytics roles and direct labels.

## Motion

- Semantic duration tokens: `--fg-motion-fast: 180ms`; `--fg-motion-standard: 220ms`.
- Keep CSS transitions for small surface/focus changes; Motion library remains available for meaningful state transitions.
- The `prefers-reduced-motion: reduce` block disables prolonged animation, reduces transitions to effectively immediate, and removes scroll animation/elevation.
- Verify with browser emulation and keyboard interaction before claiming complete motion accessibility.

## Map semantics

- Healthy shipment route without open excursion: Glacier Teal.
- Open excursion route: Amber.
- Critical excursion route: Rose.
- Selected route: Polar Cyan.
- No marker is drawn when location is unavailable. Simulated and operator-reported positions are identified in the detail UI.
- Route connections remain dashed direct geographic lines; they are not a road route or actual travel path.

## Findings

### FG-DS-01 — Token names previously encoded hue rather than role

- **Severity:** P2 maintainability/consistency.
- **Affected file:** `apps/web/src/styles.css`.
- **Evidence:** Tailwind values existed as legacy color-specific tokens, making it easy to scatter new role colors.
- **Impact:** inconsistent UI state colors could emerge across routes.
- **Implementation:** semantic Arctic Signal tokens were added and existing aliases point to them without replacing the application.
- **Verification:** Vite production build passed; token ratios above are computed for solid palette values. Full rendered-state sweep remains open.
- **Status:** IMPLEMENTED_NOT_VERIFIED.

### FG-DS-02 — Raster map was globally color-inverted

- **Severity:** P2 presentation/accessibility.
- **Affected file:** `apps/web/src/styles.css`.
- **Evidence:** `.leaflet-tile-pane` applied global invert/hue/brightness filters.
- **Impact:** map colors and semantics were unreliable.
- **Implementation:** removed the filter and retained standard OSM raster tiles for local/demo use with visible attribution; a no-key dark provider was not selected because CARTO requires a registered key under its current terms. See `MAP_ENGINEERING_DECISION.md`.
- **Verification:** build passed; live browser/provider visual inspection pending.
- **Status:** PARTIALLY_IMPLEMENTED.

### FG-DS-03 — Reduced-motion override covered a limited subset

- **Severity:** P2 accessibility.
- **Affected file:** `apps/web/src/styles.css`.
- **Evidence:** earlier media rule only disabled named project animations and panel hover transform.
- **Impact:** other transitions/scroll behavior could still animate.
- **Implementation:** broad reduced-duration/scroll override added, preserving the application layout.
- **Verification:** stylesheet compiles; browser emulation review pending.
- **Status:** IMPLEMENTED_NOT_VERIFIED.
