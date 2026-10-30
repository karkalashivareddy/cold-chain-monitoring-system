# Cross-tenant authorization audit

**Date:** 2026-10-30\
**Scope:** HTTP routes mounted by `apps/api/src/app.ts`, their authorization middleware, services, and the two-organization MySQL seed. This source audit is not a penetration test.\
**Status:** PARTIALLY_IMPLEMENTED. A route-group authorization matrix and broad two-organization negative MySQL suite are present. The matrix records permissions and scope, but not every individual route has paired positive/negative assertions or response-equivalence testing; this is not exhaustive proof for production multi-tenant deployment.

## Authorization model

`authenticate` verifies the access token, then reloads the caller's active user and membership for the token organization on every HTTP request (`apps/api/src/middleware/auth.ts`). Route permission middleware uses the current role-permission set. Services receive `req.auth.orgId` from that database membership; clients do not choose organization scope. Resource detail services generally query `{ id, orgId }` and return 404 for foreign or absent IDs. Create/update service methods validate relationship IDs using the caller's organization before writing.

The integration seed creates independent Northline and Meridian organizations and users (`apps/api/prisma/seed.ts`). Meridian has its own product, profile, warehouse, storage unit, sensor, reading history, and batch; Northline has shipment, incident, alert, user, and other domain records.

## Endpoint authorization matrix

All paths below are mounted under `/api/v1`. `Authenticated + permission` means an active DB membership is revalidated per request and the route's `requirePermission` is applied. Organization scope is sourced from `req.auth.orgId`, except public auth/device/health routes explicitly noted.

| Route(s) | Auth / permission | Organization and relationship rule | Negative / positive test evidence |
|---|---|---|---|
| `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` | Public credential/refresh-cookie flows | Login selects membership from requested/default org; token refresh checks token family and membership | `auth.test.ts`; route-specific tenant tests not exhaustive |
| `GET /auth/me` | Authenticated | Current active membership; role and permissions loaded server-side | Membership revocation test in `tenancy-rbac.test.ts` |
| `GET /health/live`, `GET /health/ready` | Public operational endpoints | Not organization-scoped; readiness returns deployment-wide health/backlog counts and must be network-restricted if considered sensitive | Runtime readiness smoke; no tenant context applies |
| `GET/POST /products`, `GET/PATCH/DELETE /products/:id` | `PRODUCT_READ` / `PRODUCT_WRITE` | Reads/writes filter or fetch by caller org; temperature profile references checked within transaction | `tenancy-rbac.test.ts`; `cross-tenant-authorization.test.ts` |
| `GET/POST /batches`, `GET/PATCH /batches/:id`, `GET /batches/:id/traceability` | `BATCH_READ` / `BATCH_WRITE` | Batch, product, supplier, storage unit and temperature profile references are org-checked | `tenancy-rbac.test.ts`; `cross-tenant-authorization.test.ts` |
| `GET/POST /warehouses`, `GET/PATCH /warehouses/:id` | `WAREHOUSE_READ` / `WAREHOUSE_WRITE` | List, detail and update use caller org; nested storage/shipment data is reachable only from owned warehouse | `cross-tenant-authorization.test.ts`; additional nested-child cases remain |
| `GET/POST /storage-units`, `GET/PATCH /storage-units/:id`, `POST /storage-units/:id/maintenance` | `WAREHOUSE_READ` / `WAREHOUSE_WRITE` | Storage unit and warehouse must be same org; maintenance sensor reference is checked against caller org | Maintenance cross-org regression; detail/update ID substitution test |
| `GET /devices`, `GET /devices/stats`, `GET /devices/:id`, `POST /devices`, `PATCH /devices/:id`, `POST /devices/:id/rotate-key`, `POST /devices/:id/revoke` | `DEVICE_READ` / `DEVICE_MANAGE` | Sensor reads/writes filter by caller org; assignment target warehouse/shipment must share org; credentials are only returned on creation/rotation | Device auth and tenant tests; foreign ID mutation in `cross-tenant-authorization.test.ts`; rotation/revocation tenant matrix incomplete |
| `POST /telemetry/readings` | Device key plus schema validation and rate limit (no user JWT) | Device lookup uses opaque device ID and validated key; sensor's server-side org determines stored reading and outbox scope | `telemetry.test.ts`; spoofing/replay tests |
| `GET /telemetry/readings`, `/latest`, `/series` | `TELEMETRY_READ` | Every query includes org scope; optional sensor/storage/shipment filters intersect with that scope | Cross-tenant sensor series/list tests in `tenancy-rbac.test.ts` and `cross-tenant-authorization.test.ts` |
| `GET /simulations` | `DEVICE_READ` | Simulation rows are joined/scoped through sensors in caller org | Service source reviewed; direct foreign ID tests pending |
| `POST /simulations/devices/:sensorId/start`, `/stop`, `/reset` | `TELEMETRY_WRITE` | Sensor ID must belong to caller org before state changes | Service uses org-scoped lookup; direct negative tests pending |
| `GET /shipments`, `/map`, `GET /shipments/:id` | `SHIPMENT_READ` | Shipment/map queries use caller org; nested batches/vehicle/driver are returned through owned shipment | Cross-tenant direct detail test; list/map isolation additional tests pending |
| `POST /shipments`, `POST /shipments/:id/dispatch`, `/deliver`, `/cancel`, `PATCH /shipments/:id/position`, `POST /shipments/:id/events` | `SHIPMENT_WRITE` or `SHIPMENT_DISPATCH` | Origin warehouse, batches, vehicle and driver are org-checked; mutations first fetch shipment by caller org | Shipment integration tests; cross-tenant action ID tests in `cross-tenant-authorization.test.ts`; foreign nested-reference cases remain partial |
| `GET /alerts`, `POST /alerts/:id/acknowledge` | `INCIDENT_READ` / `INCIDENT_WRITE` | Alert list/detail mutation is scoped to caller org; associated excursion and incident are linked through the alert | Alert lifecycle tests; foreign acknowledgement regression |
| `GET /incidents`, `/stats`, `/:id`; `POST /:id/acknowledge`, `/assign`, `/investigate`, `/resolve`, `/notes` | `INCIDENT_READ`, `INCIDENT_WRITE`, or `INCIDENT_RESOLVE` | Incident reads/mutations scoped by org; assignee membership is org-scoped; linked alert/excursion are persisted from the incident | `incidents.test.ts`; concurrent resolution test; foreign read/note test |
| `GET /dashboard`, `/overview`, `/temperature-trends` | `ANALYTICS_READ` | Organization ID comes from authenticated membership for every query | Dashboard isolation in `tenancy-rbac.test.ts`; dashboard browser smoke |
| `GET /analytics`, `/risk`, `/warehouses`, `/devices`, `/expiring`, `/delivery` | `ANALYTICS_READ` | Aggregate queries bind `orgId` in Prisma/parameterized SQL | Dashboard/analytics integration coverage; dedicated response reconciliation and negative tests partial |
| `GET /audit-logs` | `AUDIT_READ` | Query predicate always includes org; supported filters are entity type/action/actor/date | RBAC and current-org audit test; foreign entity records excluded in cross-tenant test |
| `GET /users`, `/assignable`; `POST /users`; `PATCH /users/:userId/role`; `DELETE /users/:userId` | `USER_READ`, `INCIDENT_READ`, `USER_MANAGE` | Membership operations use composite org/user key; assignable list filters membership by caller org | RBAC/revocation tests and foreign membership substitution in `cross-tenant-authorization.test.ts` |
| `GET /reports/temperature`, `/shipments`, `/incidents`, `/batch/:id`, `/summary.pdf` | `REPORT_READ` | Read queries include caller org; batch export resolves `{ id, orgId }`; exports include only scoped rows | Foreign batch report test; CSV/PDF content-specific leakage tests remain partial |
| `GET /dbms/overview`, `/tables`, `/views`, `/triggers`, `/routines`, `/explain`, `/explain-reservation`, `/incident-summary`; `POST /dbms/verify-rollback` | `ANALYTICS_READ` | Explain/reservation/incident summary use caller org. Schema metadata endpoints report shared deployment-level MySQL metadata, not tenant rows; table row estimates are global metadata | Source reviewed; metadata is intentionally deployment-wide and may reveal approximate total system scale; tenant product decision needed before exposing to untrusted customers |
| Socket.IO `/socket.io` | Access token + active membership | Server selects tenant and permission-scoped topic rooms; membership/permissions periodically revalidated | `realtime.test.ts` covers tenant separation, permission-specific delivery, role change disconnect and invalid token; 6 outbox/realtime tests pass |

## Executed negative and positive coverage

Current real-MySQL regressions cover:

- Northline vs Meridian list and dashboard scoping.
- Foreign shipment detail returns the same 404/`NOT_FOUND` response as a missing ID.
- Foreign product/batch/warehouse/storage unit/device/shipment/incident/alert ID substitutions for reads and mutations/deletion do not mutate the stored Northline record.
- Foreign telemetry series/report/batch paths do not reveal rows; search/list filters return zero rows for Northline-only identifiers; audit queries do not expose the foreign shipment's events.
- Foreign user role update/removal and `/users/assignable` do not disclose another tenant's membership.
- Foreign product/batch profile and maintenance sensor references are rejected without mutation; same-tenant writes succeed.
- Viewer write and operator resolution permissions are denied server-side; immediate membership revocation invalidates the next API request.

`cross-tenant-authorization.test.ts` passed all 5 tests against `frostguard_test`; the complete API suite also passed after addition. Existing test setup resets only `frostguard_test`; do not point it at a valuable database.

## Findings and remaining acceptance gaps

1. **Realtime permission leak — corrected and verified:** Socket rooms are topic/permission scoped, current membership and permissions are revalidated every 30 seconds, and the client cannot select an organization room. Realtime tests cover topic access and role-change disconnect. The transport remains process-local, so production must use one realtime-serving API process until a shared adapter is installed and tested.
2. **Deployment-wide DBMS metadata, P2:** DBMS showcase exposes schema definitions, trigger/routine source, and approximate global table row counts to any member with analytics permission. It does not return another tenant's records directly, but aggregate volume/schema details are not tenant-specific. Decide whether this remains a prototype demonstration feature or receives a narrower administrative policy before multi-customer deployment.
3. **Endpoint coverage is representative, not exhaustive:** The matrix lists route groups, while endpoint-level positive/negative tests remain uneven. Search, audit and batch-report leakage tests pass, as do foreign nested references for shipment creation. Some report/export formats, every nested relation and side-channel timing equivalence remain untested. No bulk API route was found in current route inventory.
4. **Failure-path tests:** Cross-tenant suite: 5 tests passed. Four trigger-injected transaction failures also pass; see `docs/audit/TRANSACTION_FAILURE_AND_ROLLBACK_AUDIT.md` for remaining fault-injection gaps.

No penetration test was performed. The assessment distinguishes verified HTTP integration evidence from source-only review and pending tests.
