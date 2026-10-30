# Dependency Advisory Assessment

**Assessment date:** 2026-10-30\
**Lockfile:** root `package-lock.json` in the preserved working tree\
**Status:** **PARTIALLY_IMPLEMENTED** — a fresh registry audit confirms three high-severity package-path findings; the compatible remediation remains unverified.

## Evidence and limitation

Installed-tree inspection was performed with:

```powershell
npm.cmd ls prisma @prisma/client @prisma/config deepmerge-ts tsx vitest --all --json
npm.cmd ls --omit=dev prisma @prisma/config deepmerge-ts --all --json
npm.cmd ls --all deepmerge-ts
```

The current installed versions are `prisma@6.19.3`, `@prisma/client@6.19.3`, `@prisma/config@6.19.3`, and `deepmerge-ts@7.1.5`. The dependency path is:

```text
@frostguard/api -> prisma@6.19.3 -> @prisma/config@6.19.3 -> deepmerge-ts@7.1.5
```

`@prisma/client@6.19.3` declares Prisma as an optional peer; npm's installed-tree report also shows that chain below the client. The lockfile marks `prisma`, `@prisma/config`, and `deepmerge-ts` `devOptional: true`. The `--omit=dev` command above was run against the existing installed tree, not a clean production install, so it does not prove what a clean `npm ci --omit=dev` tree contains.

A fresh registry-backed `npm.cmd audit --json` on 2026-10-30 returned a report (exit 1): 3 high, 0 critical, all on the same `deepmerge-ts` advisory chain. `npm.cmd audit --omit=dev --json` also returned the same three findings (exit 1). Thus the advisory cannot be described as development-only for the purposes of npm's production omission calculation. `npm.cmd ls --omit=dev` against the already-installed tree is not a clean production install and does not establish whether a fresh deployment image retains the optional peer path. A clean isolated `npm ci --omit=dev` audit remains required.

## Finding

| Package / installed version | Advisory and affected range | Dependency classification / path | Reachability and impact | Patched version / disposition |
| --- | --- | --- | --- | --- |
| `deepmerge-ts@7.1.5` | [GHSA-ggr8-5vv4-36mx / CVE-2026-40345](https://github.com/advisories/GHSA-ggr8-5vv4-36mx), High, CVSS 8.2; affected `<8.0.0` | Transitive from `@prisma/config@6.19.3`, pulled by Prisma CLI; lockfile marks it dev-optional. The API's `@prisma/client` also has Prisma as an optional peer, and the existing installed tree includes that peer. | The affected `deepmerge` functions can recurse indefinitely on crafted cyclic object graphs and exhaust the JavaScript stack. The path is Prisma config loading/generate/migrate tooling; no application request handler imports `deepmerge-ts` or accepts cyclic JavaScript object graphs through JSON. CLI/config inputs remain a local build/operator-controlled surface. | Advisory lists `8.0.0` as patched. No override or major ORM upgrade was applied: overriding a dependency pinned by Prisma would need compatibility validation; Prisma 7 is a major migration. Residual remains open until verified against the exact current audit and a clean install. |
| `@prisma/config@6.19.3` | High finding propagated from the vulnerable transitive dependency in the current npm audit result; not a separate root-cause advisory | Transitive below `prisma`; lock node is `devOptional` | Config loader is part of CLI path. Not imported by FROSTGUARD API request code. `npm audit --omit=dev` nevertheless reports the chain. | Upgrade only via compatible Prisma release or a tested, scoped override; clean production install required to verify reachability. |
| `prisma@6.19.3` | High finding propagated from the same transitive advisory in current npm audit result; affected package range is reported by npm as `6.13.0-dev.1 - 7.10.0` | Direct API devDependency and optional peer of `@prisma/client`; lock node is `devOptional` | CLI is used for generation and migrations, not imported by API request handlers. npm's `--omit=dev` audit still reports it. | npm suggests `prisma@7.10.1`, marked semver-major. Do not use `npm audit fix --force`; complete isolated upgrade/override assessment first. |

The upstream advisory describes denial of service when both merge inputs include matching self-references. JSON request payloads cannot represent cyclic object graphs; Prisma configuration and programmatic CLI inputs still warrant treating the finding as a real development/operations risk rather than dismissing it.

## Prisma major-upgrade compatibility assessment

The repository currently uses Prisma 6.19.3, `prisma-client-js`, generated `@prisma/client` imports, Prisma schema datasource URLs, and the Prisma 6 client lifecycle. The [official Prisma ORM v7 upgrade guide](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7) identifies breaking changes relevant to this codebase: ESM packaging/configuration, an explicit generated-client output and changed import paths, driver adapters for database connections, datasource configuration changes, and explicit seeding behavior. Prisma 7 also requires updating both CLI and client packages.

The Prisma 7 migration was not attempted. An ORM major migration solely to address one transitive advisory is not justified without a full branch-level compatibility exercise, disposable MySQL migration, generated-client review, and all integration tests. Prisma 8 is documented by Prisma as a release candidate in the current documentation and is not an appropriate shortcut for this release gate.

## Isolated remediation attempt

An isolated `git archive` copy of commit `7d55f0a` was used for a dependency override experiment. No repository source, lockfile, or database was changed by the experiment.

- Added a root npm override for `deepmerge-ts@8.0.0` and ran `npm install --package-lock-only --ignore-scripts --no-audit`. npm still resolved `@prisma/config@6.19.3 -> deepmerge-ts@7.1.5`; the override did not apply.
- A clean `npm ci --no-audit` succeeded in the temp copy (547 packages; install scripts disabled), but the lockfile remained on the vulnerable chain and the audit continued to report three high findings.
- `prisma validate` and `npm run db:generate` could not complete because the Prisma Windows schema-engine checksum download from `binaries.prisma.sh` failed in that isolated environment. No schema migration or database test ran.
- The upstream [deepmerge-ts 8.0.0 release notes](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0) list circular-reference support and the advisory fix, while also documenting behavior changes. API-shape similarity alone is not sufficient evidence to override Prisma's exact 7.1.5 dependency.

**Disposition:** Do not adopt the override or claim remediation. The high advisory remains open. A supported Prisma release update or a tested nested override requires a working schema-engine download plus validation, client generation, disposable MySQL migration, and full integration/build regression.

## Defensible interim mitigation

- Keep the current Prisma config/schema and migrations repository-controlled; do not merge untrusted `prisma.config.*` or schema files into developer/CI jobs.
- Keep Prisma CLI usage in trusted developer/CI workflows and do not expose CLI config-loading functionality to end users.
- Build a clean production dependency tree (`npm ci --omit=dev`) in a network-enabled isolated job and run `npm audit --omit=dev --json`; record whether optional peer resolution retains this path.
- Re-run full lockfile `npm audit --json`, and inspect every advisory path; do not rely on a package-name classifier alone.
- If retrying overrides, use an isolated temporary copy and target the precise `@prisma/config` dependency path. Validate Prisma config load, `prisma validate`, `prisma generate`, fresh MySQL migration, API integration tests, typecheck, production build, and the final dependency tree before adopting it. The first root-level override attempt did not apply.
- If an upstream Prisma release updates its exact `deepmerge-ts` pin, prefer that supported update and remove any temporary override.

## Reproduction and follow-up

Run in a network-enabled checkout with Node/npm versions recorded:

```powershell
npm.cmd ci
npm.cmd audit --json
npm.cmd audit --omit=dev --json
npm.cmd ls prisma @prisma/client @prisma/config deepmerge-ts --all
```

`npm audit` returns nonzero when advisories exist; preserve and review its JSON even on that exit. Current audit is verified as of the evidence date but the clean production-only dependency graph remains unverified. The dependency gate is **PARTIALLY_IMPLEMENTED**, with the high advisory explicitly assessed and unresolved; it is not a resolved risk.
