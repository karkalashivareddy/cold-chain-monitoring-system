# Security Controls

This is an implementation inventory, not a claim of certification or penetration testing.

| Control | Evidence | Status |
| --- | --- | --- |
| Password hashing | Argon2 implementation in `apps/api/src/security/password.ts` | **IMPLEMENTED** |
| Access and refresh sessions | JWT access token plus opaque refresh-token flow; HTTP-only cookie/bearer handling | **IMPLEMENTED**; full lifecycle tests cover auth baseline. |
| Organization membership and role checks | `middleware/auth.ts`, shared permission constants, tenant scoped services | **VERIFIED** by tenancy/RBAC tests. |
| Request schema validation | Shared/local Zod schemas and validation middleware | **IMPLEMENTED**; normal API tests pass. |
| Security headers | Helmet with CSP and frame/base/object restrictions | **IMPLEMENTED**; browser behavior not inspected. |
| CORS | Explicit configured origin allowlist, credentials, restricted methods/headers | **IMPLEMENTED**; deployment values need review. |
| CSRF | Cookie-authenticated state changes require `x-frostguard-csrf: 1`; bearer-token calls are not cookie-authenticated | **IMPLEMENTED**. |
| Rate limits | Global, login and per-device telemetry limiters | **IMPLEMENTED**; process-local behavior. |
| Device authentication | Per-device key hashed at rest, constant-time verification, revocation and rotation endpoints | **VERIFIED** in telemetry credential tests; rotation/revocation not separately exercised here. |
| Optional device HMAC | Signature verification on telemetry payload | **IMPLEMENTED**; optional and not tested for replay semantics. |
| Immutable telemetry | SQL before-update trigger; real MySQL test confirms rejected update | **VERIFIED**; delete remains governed by DB account privileges. |
| Realtime authorization | Access token plus membership lookup; server-controlled `org:<id>` room | **IMPLEMENTED**; socket tests not present. |
| Audit / transaction outbox | In-transaction audit and outbox writes; database triggers reject direct audit-row updates/deletes; post-commit worker publication | **IMPLEMENTED** for direct statements; cascades bypass child delete triggers and a DB owner can alter them. Multi-process delivery semantics need work. |
| Production secret guard | Missing `NODE_ENV` defaults to production; common demo/test placeholders are rejected | **IMPLEMENTED**; environment tests cover fail-closed default and placeholders. |
| Dependency audit automation | npm audit JSON in CI classified against `package-lock.json` development/optional flags | **IMPLEMENTED**; classifier ran against current registry output and found no high/critical runtime entries. Remote workflow has not run. |
| DBMS metadata interface | `dbms.routes.ts` returns 404 in production and requires `SETTINGS_MANAGE` in development/test; frontend route has the same permission gate | **IMPLEMENTED**; DBMS integration tests verify manager denial and owner access. |
| TLS, private database, secret manager | Not configured in repository | **NOT IMPLEMENTED** for a deployment. |

## Production configuration expectation

Set `NODE_ENV=production` with unique high-entropy access-token, device HMAC and seed passwords, a production database credential, strict web origin, HTTPS termination, private DB access and managed secrets. Refresh tokens are opaque, database-backed values and have no JWT signing secret. Never use seeded demo accounts or predictable demo device keys outside local demonstrations. If `NODE_ENV` is unset, the API defaults to production behavior and rejects placeholder secrets.
