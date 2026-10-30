# Asset license and provenance register

**Audit date:** 2026-10-30\
**Repository state:** local working tree on `main`; public image directory is untracked at this baseline, and image files are not in Git history.\
**Acceptance:** PARTIALLY_IMPLEMENTED. The five original photographic assets remain untouched in the workspace but have been removed from active page references and the preload. Original project-created SVG illustrations now provide those visual roles. The JPEGs must be excluded from commits and public redistribution unless provenance is established.

## Product assets

| File | Use observed | Source / creator | License / attribution | Redistribution basis | Status |
|---|---|---|---|---|---|
| `apps/web/public/images/hero-coldroom.jpg` | Previously landing hero; now unreferenced | Unknown; no provenance note, asset source record, or matching Git history found | Unknown | None established; retain locally, exclude from publication | SHA-256 `66D7DB5E9E4D3132DD07DE588C048787EBA9CF261B28D3C221F86B4CAA4C32C3`; BLOCKED / unpublished |
| `apps/web/public/images/control-room.jpg` | Previously landing section; now unreferenced | Unknown; no provenance note, asset source record, or matching Git history found | Unknown | None established; retain locally, exclude from publication | SHA-256 `A90D3DAE81B7947F7B9AD154CFE2F7F2B7AF06A424371F8722CF5444CF298705`; BLOCKED / unpublished |
| `apps/web/public/images/reefer-truck.jpg` | Previously shipment section; now unreferenced | Unknown; no provenance note, asset source record, or matching Git history found | Unknown | None established; retain locally, exclude from publication | SHA-256 `7DDE5ECD0BCE75CA48C823A12F8EECA5EB211156E16EC11F5E1ACD11CCCE3C39`; BLOCKED / unpublished |
| `apps/web/public/images/pharma-line.jpg` | Previously industry section; now unreferenced | Unknown; no provenance note, asset source record, or matching Git history found | Unknown | None established; retain locally, exclude from publication | SHA-256 `4A52681C786487F0068509D089203528F474F987D10E0ACC3D89CC8A8DC17555`; BLOCKED / unpublished |
| `apps/web/public/images/lab-vials.jpg` | Previously login-page image; now unreferenced | Unknown; no provenance note, asset source record, or matching Git history found | Unknown | None established; retain locally, exclude from publication | SHA-256 `B9BDDD9DBA731488CE04E2884E1A94AF43F5DCD91022D87015917AF431BFA4B6`; BLOCKED / unpublished |
| `apps/web/public/illustrations/cold-room.svg`, `control-system.svg`, `reefer-route.svg`, `traceability.svg`, `login-coldchain.svg` | Landing page sections and login visual | Original SVG artwork created in this repository for this project | No third-party asset, font, or image is embedded; inspectable inline vector paths and gradients | Project-created work; no external redistribution restriction identified | IMPLEMENTED; UI refs switched and production build passed |
| `apps/web/public/favicon.svg` | Public favicon (`apps/web/index.html`) | Local SVG appears purpose-drawn for FROSTGUARD; author/provenance is not recorded | No third-party source or license statement found; repo/package is private and marked UNLICENSED | Ownership and intended license need confirmation before third-party redistribution | PARTIALLY documented; no third-party usage claim |
| `lucide-react` icons | Inline UI icons imported across `apps/web/src` | Lucide contributors; installed package `lucide-react` | ISC; package `node_modules/lucide-react/LICENSE` | Dependency license permits use subject to its included terms; retain upstream license notice in distributed dependency artifacts | IMPLEMENTED in source; package license observed |
| `docs/audit/screenshots/release-candidate-20261030/*.png` | Current landing and seeded dashboard visual evidence | Captured locally by Playwright from the current app, using original project SVGs | Screenshot capture is original; no unlicensed photography is embedded | Project-generated audit evidence; seeded/demo data only | VERIFIED locally; captured screenshots do not prove all-route visual or accessibility conformance |
| Older `docs/audit/screenshots/*.png` | Historical landing/dashboard evidence | Captured locally by Playwright; embeds photographic assets whose source is unknown | Embedded JPEG usage remains uncleared | Same unresolved rights as the original JPEGs shown in captures | BLOCKED for public redistribution; files remain untouched and unstaged |

## Other assets inspected

- No local font files (`woff`, `woff2`, `ttf`, `otf`) were found in `apps/web` or the repository source set. The inspected source does not declare `@font-face` or a remote font host; the design uses CSS/system typography.
- No external image hotlinks are used. The landing and login pages now reference original local SVG illustrations. The five JPEGs remain in the workspace but are no longer referenced by the HTML or page source.
- Favicon SVG is an inline local vector, not an emoji or externally hosted icon.
- New generated screenshots in `release-candidate-20261030/` contain only original SVG artwork and seeded demo values; historical root-level screenshots remain uncleared.

A hash can identify the files for a future source/permission match; it does not establish authorship or license. The image files are untracked in Git, so no commit history can establish when or by whom they were introduced.

## Disposition and next step

The app references have been replaced with original SVG visuals; the JPEG files were not deleted and must not be included when staging the repository. Only screenshots under `release-candidate-20261030/` are approved as current visual evidence; historical root-level screenshots with unknown imagery remain excluded. Do not infer rights from search-engine availability.
