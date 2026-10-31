# Production readiness assessment

**Assessment date:** 2026-10-31\
**Status:** NOT READY FOR PRODUCTION DEPLOYMENT. Local development and selected application tests pass, but no production deployment was attempted or authorized. No cloud services were provisioned and no paid costs were incurred.

## Repository and configuration evidence

- The repository has a root `.env.example` and a separate `.env.compose.example` with local-only placeholders; `.gitignore` excludes `.env` and `.env.*` but allows the checked-in templates. No secret value from the local API `.env` was inspected or copied.
- `apps/api/src/config/env.ts` validates required database/JWT settings, rejects known development/test placeholders in production, requires different access and refresh secrets, and enables secure cookies when `NODE_ENV=production`.
- `apps/api/src/server.ts` starts Socket.IO and the in-process outbox worker and handles SIGINT/SIGTERM by stopping simulations/worker, closing realtime, closing HTTP, and disconnecting Prisma.
- `apps/api/src/modules/health/health.routes.ts` provides liveness and readiness endpoints. Readiness queries MySQL and reports database latency and aggregate pending-outbox/active-incident counts. Deploy behind a proxy that restricts access to internal operational endpoints if that information is not intended for anonymous callers.
- The production build and local compiled API/browser smoke were verified in the separate audit record. They do not establish a deployed environment.
- API and web multi-stage Dockerfiles, `docker-compose.yml`, `.dockerignore`, Nginx proxy configuration and `.env.compose.example` now define a single-instance local stack. `docker compose config` passes. Docker Engine is unavailable (the named pipe is missing), so image builds, container health checks, migration startup and runtime smoke are unverified. See [local Compose deployment](DOCKER_LOCAL.md).
- No hosted deployment, DNS, HTTPS certificate, firewall/network policy, private MySQL boundary, managed secret store, backup/restore drill, or production logging/monitoring integration has been verified.

## Production gate matrix

| Area | Status | Evidence / required work before deploy |
|---|---|---|
| Production build | VERIFIED locally | `npm.cmd run build` passes; artifact is not a deployment image |
| Environment validation | IMPLEMENTED_NOT_VERIFIED for hosted configuration | Production placeholder/reused JWT secret checks exist; generate unique secrets in a managed secret store and validate every required variable in the target environment |
| Database migration | PARTIALLY_IMPLEMENTED | Initial Prisma migration and SQL control files applied to a clean disposable schema; define a production migration job, backup/restore, rollback policy, least-privilege account, private network, TLS policy and retention before use |
| Health checks | IMPLEMENTED_NOT_VERIFIED | `/health/live` and `/health/ready` exist; verify proxy/host semantics and restrict operational metadata as appropriate |
| Graceful shutdown | IMPLEMENTED_NOT_VERIFIED | Signal handlers are present; no container/orchestrator drain test or shutdown-under-load test was run |
| TLS / reverse proxy | PARTIALLY_IMPLEMENTED | Local Nginx reverse proxy exists without TLS; configure and verify HTTPS termination and secure forwarded-header handling in the selected host |
| Network isolation | NOT_IMPLEMENTED | Keep MySQL private; expose only required HTTPS API entry point; set provider firewall/security group rules and DB allowlist |
| Secrets | NOT_IMPLEMENTED for hosted deployment | `.env.example` is for local development only; use managed secrets, rotation procedures, and prevent values from entering build args, frontend bundles, logs or artifacts |
| Process model | PARTIALLY_IMPLEMENTED | API starts an in-process outbox worker and simulator timers; no multi-instance coordination/adapter is verified. Use one API process until the worker/socket topology is made replica-safe |
| Logging / observability | PARTIALLY_IMPLEMENTED | Pino and health routes exist; connect log collection, redaction review, alerting, metrics, retention and incident runbooks in the target environment |
| Backups / recovery | NOT_IMPLEMENTED | No automated backup schedule or restore drill evidence |
| Container image | IMPLEMENTED_NOT_VERIFIED | Multi-stage API/web images, non-root API runtime, health checks and migration target exist. Build and runtime checks are blocked by the missing Docker Engine; image scan and multi-stage signal/migration smoke remain outstanding |
| Local Compose deployment | IMPLEMENTED_NOT_VERIFIED | Compose syntax passes; MySQL is internal and persistent, API/web are health-gated and migration precedes API. No container was built or started on this host |
| CI | IMPLEMENTED_NOT_VERIFIED for current changes | GitHub Actions run `41110200375` passed all configured steps on baseline SHA `42f1ab5`; the current completion changes still require a run on their final pushed SHA |
| Security validation | PARTIALLY_IMPLEMENTED | High development/optional Prisma tooling advisory remains assessed separately; no penetration test, production TLS review, or external assessment occurred |
| Asset redistribution | PARTIALLY_IMPLEMENTED | Landing/login references original project SVGs; five unknown JPEGs remain unreferenced locally and must be excluded from publication; see asset register |

## Recommended hosting topology (not deployed)

1. Serve the static web build through a CDN or TLS-terminating reverse proxy.
2. Run the API in a managed container/app service, initially single instance due to process-local realtime/outbox/simulation coordination.
3. Place managed MySQL on a private network, with TLS where supported, backups and a least-privilege application credential.
4. Inject production secrets from the host's managed secret store; do not mount the repository `.env.example` as production configuration.
5. Run a controlled migration step before API rollout and verify readiness afterward.
6. Restrict inbound traffic to HTTPS at the edge and API/database access only from authorized service networks. Nginx/reverse proxy configuration is not a firewall.
7. Add durable centralized logs, service/database metrics, alert routing, backup/restore runbooks, and secret/device-credential rotation procedures.

This is a proposed topology, not a verified deployment design. Confirm provider-specific networking, TLS, migration and backup behavior before implementation. No deployment or spending is authorized by this report.

## CI source review

`.github/workflows/ci.yml` provisions MySQL 8.4 and runs `npm ci`, Prisma generation, migration + SQL application, typecheck, lint, build, MySQL tests, Chromium/browser tests and dependency advisory classification. Baseline GitHub Actions run `41110200375` passed for SHA `42f1ab5`; the final revision remains to be verified. `actionlint` was unavailable locally. See [CI validation notes](../development/CI_VALIDATION.md).

## Deployment decision

Do not label the current tree production-ready. Local deployment definitions are implemented but runtime-unverified. Hosted deployment remains NOT_IMPLEMENTED until network isolation, TLS, managed secrets, backup/restore, production migration/rollback, process scaling, monitoring, asset rights, and target-host smoke checks have evidence. This prototype is not production-certified or medically validated.
