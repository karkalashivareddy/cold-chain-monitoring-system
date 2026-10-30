# Security review

**Review date:** 2026-10-30.\
**Scope:** current source, test evidence, organization data paths, device ingestion, dependency audit and deployment controls. This is not a penetration test, certification, or production security assessment.

## Findings and disposition

| Priority | Finding | Disposition / residual |
|---|---|---|
| High, corrected | Product/batch temperature-profile IDs and storage maintenance sensor IDs were not consistently checked for same-organization ownership. | Checks now run inside write transactions. MySQL tenant tests cover product create/update, batch create/update and maintenance sensor references; cross-organization attempts reject without mutation, same-organization writes succeed. |
| High, corrected | A late lower-sequence telemetry sample could change open excursion state; device payload could claim synthetic provenance. | Ingestion locks the sensor row, reads current sequence, stores delayed readings as history without changing live excursion/alert state, and derives synthetic status from trusted internal simulator context. Tests added. |
| High, residual, Prisma config path | Prisma 6.19.3 → @prisma/config 6.19.3 → deepmerge-ts 7.1.5 is affected by GHSA-ggr8-5vv4-36mx. Both `npm audit --json` and `npm audit --omit=dev --json` report the finding; the installed path is a dev dependency and optional peer. The affected merge function is used for Prisma config loading, not API request JSON. A clean production-only install has not been verified, so do not call the risk development-only. npm recommends Prisma 7.10.1, a major upgrade. Keep config/schema repository-controlled and do not process untrusted Prisma config; test a supported upgrade or isolated override before release. Residual remains P1. |
| Medium, addressed | Vitest 4.1.11 had two moderate @vitest/mocker advisories; 4.1.11 also surfaced two moderate advisories fixed in 4.1.12. | Updated to Vitest 4.1.12 through non-major patch releases. Current audit output no longer lists the Vitest or Tinypool findings; latest full suite passed 66/66 MySQL integration tests. |
| Medium, residual | Tenant ownership is largely enforced by service-scoped IDs rather than composite tenant foreign keys. | Profile references are corrected; other relation write paths still need systematic review. |
| Medium, residual | Tests cover authenticated topic permissions and periodic membership revalidation, but do not prove immediate disconnect after membership revocation. | Add a revocation integration test and define maximum stale authorization window. |
| Medium, residual | Outbox leases support concurrent claim/recovery, while Socket.IO fanout uses the in-memory adapter. | Operate one realtime-serving API instance or add and validate a shared adapter before horizontal scaling. |
| Not tested | Penetration testing, deployment TLS/network boundaries, secret manager, backup/restore. | Do not claim these were tested; deployment remains unimplemented. |

## Dependency audit evidence

Commands:

- npm audit --json against the current lockfile after Vitest 4.1.12; npm exits 1 because Prisma CLI/config advisories remain.
- node scripts/check-audit.mjs on that exact JSON report; exits 0 with “No high/critical advisories affect runtime dependency entries.”

Current advisories:

- deepmerge-ts below 8.0.0, GHSA-ggr8-5vv4-36mx, stack exhaustion while merging recursive object graphs.
- @prisma/config and prisma 6.19.3 inherit the high advisory path.
- npm's proposed automated remediation is prisma 7.10.1 and is semver-major.

The major upgrade has a substantial compatibility surface: Prisma 7 requires updating both prisma and @prisma/client, a driver adapter for direct database access, a new generated-client output/import path, ESM/config changes, and connection-pool review. This repository currently uses Prisma 6.19.3, prisma-client-js and @prisma/client imports throughout. No forced major upgrade was applied. Review the official migration guidance before starting that work:

- https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7
- https://github.com/advisories/GHSA-ggr8-5vv4-36mx

Vitest 4.1.12 is the current test-runner dependency; Tinypool is no longer present in the dependency tree. The current registry audit lists no Vitest/Tinypool findings. Typecheck, lint, build and all 40 integration tests pass after this update.

## Important implementation controls observed

Argon2 password hashing, server-side authorization/membership checks, Zod request validation, Helmet, CORS, CSRF guard, rate limits, device key hashing, device revocation/rotation routes, append-only telemetry update trigger, audit writes and post-commit outbox publication are present. Their existence does not establish comprehensive security. Detailed control evidence and remaining tests are in SECURITY_CONTROLS.md and THREAT_MODEL.md.
