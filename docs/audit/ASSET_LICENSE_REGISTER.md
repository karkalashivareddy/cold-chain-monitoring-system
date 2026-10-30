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
| Playwright screenshots in `docs/audit/screenshots/` | Audit evidence for landing/dashboard | Captured locally by Playwright; they embed the page's photographic assets | Screenshot capture is original, but embedded JPEG usage remains uncleared | Same unresolved rights as the JPEGs shown in the captures | BLOCKED for public redistribution until embedded content is cleared |

## Other assets inspected

- No local font files (`woff`, `woff2`, `ttf`, `otf`) were found in `apps/web` or the repository source set. The inspected source does not declare `@font-face` or a remote font host; the design uses CSS/system typography.
- No external image hotlinks are used. The landing and login pages now reference original local SVG illustrations. The five JPEGs remain in the workspace but are no longer referenced by the HTML or page source.
- Favicon SVG is an inline local vector, not an emoji or externally hosted icon.
- Generated browser screenshots are documentation evidence, not application assets, but contain the uncleared image pixels listed above.

A hash can identify the files for a future source/permission match; it does not establish authorship or license. The image files are untracked in Git, so no commit history can establish when or by whom they were introduced.

## Disposition and next step

The app references have been replaced with original SVG visuals; the JPEG files were not deleted and must not be included when staging the repository. Existing screenshots contain the unknown images and must likewise be excluded until regenerated from the updated UI. Do not infer rights from search-engine availability.
