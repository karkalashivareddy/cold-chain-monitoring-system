# Contributing to FROSTGUARD

Thanks for helping improve FROSTGUARD. It is a demonstration prototype, not a certified cold-chain control system.

Project-owned code and documentation are licensed under MIT; contributions are accepted under the same terms. See [LICENSE](LICENSE) and [license policy](docs/LICENSE_POLICY.md). Do not contribute third-party assets unless their license and attribution are documented.

## Local setup

Requirements: Node.js 20.19 or newer, npm, and MySQL 8.4 LTS with a local development database.

1. Install dependencies: `npm ci`.
2. Copy `.env.example` to `apps/api/.env` and replace local credentials/secrets as needed. Do not commit `.env` files.
3. Generate Prisma client: `npm run db:generate`.
4. Apply migrations, SQL objects and demo seed: `npm run db:setup`.
5. Start API and web: `npm run dev`.

The telemetry contract requires a stable per-boot `bootId`; send a new one after a device restart so a reset sequence counter is accepted safely. See the API description at `/api/v1/docs`.

The demo seed creates predictable demonstration users and device credentials. Use them only in a disposable local environment.

## Before opening a pull request

Run the checks relevant to your change:

```sh
npm run typecheck
npm run lint
npm run build
npm test
```

The API integration suite resets and seeds only `frostguard_test` at `localhost:3306` by default. Do not point it at a database with data you need.

## Engineering expectations

- Preserve the existing React, Express, Prisma, MySQL and shared-contract architecture unless a demonstrated need supports a change.
- Keep domain rules in service/domain code, validate HTTP inputs, and enforce tenant scope on every data access.
- Write audit and outbox rows in the same transaction as consequential domain changes.
- Keep telemetry observations immutable. Add corrections as new evidence.
- Excursions trigger investigation; do not implement automatic product safety/spoilage conclusions.
- Mark simulator telemetry and simulated location clearly. Never present them as physical device/GPS data.
- Add tests for state changes, tenant boundaries, transaction rollback and concurrency where relevant.
- Update architecture/database/security docs when behavior or invariants change.

## Pull requests

Include a concise problem statement, implementation summary, checks run, migration implications, security considerations and screenshots for UI changes. Do not include secrets, database dumps, personal data, or unlicensed assets.
