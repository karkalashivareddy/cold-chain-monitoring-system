# Final Performance Audit

**Date:** 2026-10-30

## Build measurements

Initial reported `npm.cmd run build` output was compared with the current successful build. The current build no longer emits the entry-chunk warning. Current artifacts:

| Artifact | Minified size | Gzip size |
| --- | ---: | ---: |
| Largest current entry JavaScript chunk | 497.93 kB | 152.00 kB |
| Charts chunk | 409.19 kB | 115.43 kB |
| Route map chunk | 156.56 kB | 46.13 kB |
| CSS | 73.55 kB | 16.53 kB |

The prior reported largest entry was 903.52 kB minified / 223.88 kB gzip. Current build entry is 497.93 / 152.00 kB. This is an observed artifact-size reduction in the current tree, not a controlled attribution to one change. The chart and map remain large route chunks; route-level lazy loading is present.

## Not measured

No browser Core Web Vitals (LCP, INP, CLS), mobile network profile, API latency percentile, MySQL query latency, memory profile, realtime throughput or map/chart interaction time was measured. No user-perceived performance improvement is claimed.

## Follow-up

Capture a repeatable browser baseline for public landing and authenticated dashboard, profile route bundles, and inspect Recharts/Leaflet dependency sharing. Measure representative API and SQL plans against a documented dataset before adding indexes or caching.
