# Design system specification — Arctic Signal

**Identity:** Arctic Graphite + Glacial Cyan + Aurora Mint + Signal Amber
**Tagline:** Every Degree. Every Handoff. Accounted For.
**Implementation:** `apps/web/src/styles.css` semantic `--fg-*` tokens, aliased into existing Tailwind theme names.
**Status:** Refined semantic palette and cinematic landing hero implemented; full component-by-component visual sign-off is not complete.

## Semantic palette

| Role | Token | Value | Use |
|---|---|---:|---|
| Main background | `--fg-bg` | `#07111F` | App canvas |
| Sidebar | `--fg-sidebar` | `#0A1726` | Navigation shell |
| Secondary background | `--fg-bg-secondary` | `#0D1B2A` | Page sections |
| Surface | `--fg-surface` | `#14283A` | Cards and panels |
| Raised surface | `--fg-surface-raised` | `#193247` | Selected/interactive layers |
| Border | `--fg-border` | `#294256` | Dividers and outlines |
| Primary | `--fg-primary` | `#70D8F2` | Main action, focus, selected route |
| Secondary | `--fg-secondary` | `#54E1C2` | Healthy state, secondary accent |
| Analytics | `--fg-analytics` | `#B7A2FF` | Secondary analytics series |
| Success | `--fg-success` | `#54D9B2` | Healthy/completed status |
| Warning | `--fg-warning` | `#F7C970` | Warning/open noncritical exception |
| Critical | `--fg-critical` | `#FF7A8B` | Critical state |
| Information | `--fg-info` | `#86CFFF` | Informational state |
| Primary text | `--fg-text` | `#ECF5FC` | Main body and headings |
| Secondary text | `--fg-text-secondary` | `#A7BACB` | Supporting text |
| Muted text | `--fg-text-muted` | `#90A6B8` | Quiet labels; retains contrast on raised surfaces |
| Focus | `--fg-focus` | `#70D8F2` | Keyboard focus |

Existing Tailwind aliases (`abyss`, `deep`, `surface`, `elevated`, `line`, `ice`, `mist`, `cyan`, `teal`, `amber`, `rose`, `violet`) remain to preserve current page architecture and styles.

## Contrast evidence and limits

Relative luminance and contrast ratios were computed from the solid token values using the WCAG sRGB formula on 2026-10-31. Primary text `#ECF5FC` is 11.98:1 or higher across the main background and surfaces. Secondary text `#A7BACB` is 6.63:1 or higher; muted text `#90A6B8` is at least 5.25:1. The lowest semantic accent is critical coral at 5.29:1 on the raised surface; all status accents remain above 4.5:1 on every listed solid surface. These are token calculations, not rendered-state proof: transparent overlays, opacity utilities, browser compositing, disabled/hover states, map labels and chart graphics still need separate review. No WCAG conformance claim is made.

## Palette research and selection

The design keeps most screen area on dark, slightly blue graphite surfaces. Cyan and mint carry primary interaction and healthy-state meaning; lilac is reserved for analytic comparison; warm amber and coral stay scarce for warning and critical attention. This gives the operational UI a cooler identity with a small warm counterpoint, while leaving charts and status colors tied to meaning instead of decoration.

This selection follows three reference principles: maintain a restrained dark surface with sparse accents; map accent colors to primary, secondary, tertiary and error roles instead of applying them randomly; and verify text contrast numerically. [Material Design's dark-theme guidance](https://m2.material.io/design/color/dark-theme.html) recommends limited, desaturated color accents on dark surfaces. [Material Design 3 color roles](https://m3.material.io/styles/color/the-color-system/key-colors-tones) reserve primary for high-emphasis actions, secondary for lower-emphasis controls, tertiary for complementary highlights, and error colors for urgency. [WCAG 2.2](https://www.w3.org/TR/WCAG22/#contrast-minimum) sets 4.5:1 for normal text and 3:1 for large text; the [non-text contrast criterion](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) covers meaningful component boundaries and graphics. The palette is hand-tuned for this fixed dark product rather than claiming dynamic-theme support.

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
