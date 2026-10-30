# Threat Model

**Scope:** FROSTGUARD repository prototype as audited 2026-10-30. This is a design review, not penetration testing.

## Assets

- Product, batch, warehouse, storage-unit, shipment and incident records.
- Raw temperature readings, device identity/assignment, calibration and maintenance evidence.
- User identities, membership/role grants, session and refresh credentials.
- Device API credentials and optional HMAC signatures.
- Audit log and outbox events.
- Database credentials, JWT secrets, seed/demo credentials and deployment configuration.

## Trust boundaries

1. Browser to REST API: cookie or bearer access token; browser writes using cookies require a CSRF marker; CORS allowlist applies.
2. Device/simulator to telemetry API: device ID plus per-device key, optional HMAC over payload; device endpoint does not use user session auth.
3. REST service to MySQL: Prisma and parameterized raw SQL over `DATABASE_URL`.
4. API process to Socket.IO clients: token authentication, database membership lookup, organization room.
5. API process to external map tiles: browser loads OpenStreetMap tile hosts. No third-party map API key is configured.

## Threats and controls observed

| Threat | Existing control | Residual concern |
| --- | --- | --- |
| Cross-organization object access | Membership-derived organization context, tenant-scoped service queries and RBAC. | Not every cross-reference is backed by composite tenant foreign keys; test coverage cannot prove all object paths. |
| Credential guessing / password compromise | Argon2 password hashing, generic login failures and login rate limit. | MFA, federation, account-level throttling and recovery flow are not evidenced. |
| Cookie CSRF | SameSite cookies, CORS allowlist, custom header on cookie-authenticated writes. | Validate production origin/proxy behavior and keep all mutating browser calls on the required header path. |
| XSS / browser injection | React escaping, Helmet CSP, 1 MB JSON body limit. | CSP includes `style-src 'unsafe-inline'`; no CSP/browser security regression suite. |
| Device key theft/replay | Stored key hash, key rotation/revocation endpoints, TLS expected in deployment, sequence uniqueness, optional HMAC. | No TLS deployment proof; shared HMAC secret is optional; no explicit nonce/window/replay protocol beyond per-device sequence uniqueness. |
| Telemetry forgery or alteration | Payload Zod validation, per-device credential, SQL append-only update trigger. | Trigger does not prohibit delete by a privileged DB account; calibration and key issuance are operator responsibilities. |
| Cross-tenant socket subscription | Socket identity comes from verified token and DB membership; room is selected server-side. | Existing connected sockets are not force-disconnected on membership revocation; no socket-specific test exists. |
| Uncommitted realtime event | Transactional outbox is written with domain transaction and emitted afterward. | Multi-process row claims absent; duplicate publication can occur if scaled. |
| SQL injection | Prisma and parameterized tagged SQL; identifier choice is constrained in SQL helper. | Continue reviewing interpolated raw SQL and stored routine parameters. |
| Brute force / request flood | Global, login and telemetry rate limits; JSON body limit. | Production limits are process-local unless deployment adds shared backing/proxy controls. |
| Secret exposure | `.env.example`, ignore rules, explicit minimum secret lengths; production rejects known demo patterns after this audit change. | No secret-scanning action or external repo scan has been verified; secret rotation/secret manager is deployment work. |
| Sensitive error disclosure | Generic production API errors; request IDs and structured logs. | Verify logs and exported reports do not contain excess PII in deployment. |

## Abuse cases to keep testing

- Change a request's object ID to another tenant's ID for every detail, update, export and mutation route.
- Reuse a device sequence with changed temperature; deliver delayed sequences around excursion start/recovery.
- Rotate or revoke a device key while simulator/client continues to publish.
- Revoke a user membership while REST and Socket.IO sessions remain active.
- Race shipment stock reservation, incident resolution and outbox claims.
- Submit malformed timestamps, extreme values, duplicate identifiers and unexpectedly large valid lists.

## Deployment assumptions not verified

HTTPS termination, private MySQL networking, least-privilege database accounts, secret manager use, backup/restore, centralized rate limiting/logging, vulnerability scanning, firewall rules and production monitoring are not provided by the current repository and were not tested.
