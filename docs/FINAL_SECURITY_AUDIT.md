# Final Security Audit

**Date:** 2026-10-30\
**Method:** Source review plus existing API/MySQL integration suite. This was not penetration testing.

## Findings

| Priority | Finding | Status |
| --- | --- | --- |
| High | Deployment network controls, TLS, private MySQL, and least-privilege service credentials are not present or verified. | Open deployment requirement. |
| High | Outbox lacks multi-instance claim/lease and can publish duplicate events when multiple API processes run. | Open before horizontal scaling. |
| Medium | Existing user authorization is verified by tests, but not every cross-tenant foreign-key path is protected with composite tenant constraints. | Continue service and schema review. |
| Medium | Socket auth and organization room logic exist but have no executable socket authorization/revocation tests. | Open test gap. |
| Medium | Telemetry replay is constrained by unique device sequence; explicit HMAC freshness/nonce semantics and delayed-event handling are not comprehensively tested. | Open test gap. |
| Medium | npm audit reports high advisories in development/optional Prisma CLI/config tooling (`prisma`, `@prisma/config`, `deepmerge-ts`); no high/critical runtime finding is reported by the lockfile classifier. | Vitest was patched to 4.1.12 and no Vitest/Tinypool findings remain. Prisma auto-fix proposes a forced Prisma 7 major version; migration remains unperformed and the dev-tool residual is documented. |
| Low | Local CI workflow is not present on the remote default branch; read-only run query returned HTTP 404. | Workflow remains local/unpublished. No commit or push was performed. |

## Positive evidence

Argon2 password hashing, JWT sessions, membership-derived RBAC, request validation, CORS allowlist, Helmet, CSRF guard for cookie writes, request limits, hashed per-device credentials, revocation/rotation routes, parameterized SQL, tenant-scoped operations and an outbox are implemented. Forty MySQL integration tests verified tenancy/RBAC, device auth, append-only readings, shipment stock contention, and incident resolution contention (one success, one conflict). Product/batch profile references and maintenance sensor references have added cross-organization regression tests. Production config rejects known demo/test secret markers and reused JWT secrets.

## Scope limits

No penetration test, hosted production deployment, TLS/network review or secret store audit was performed. The registry dependency audit was executed; high findings remain in development/optional Prisma tooling. This report does not declare FROSTGUARD production-certified or medically validated.
