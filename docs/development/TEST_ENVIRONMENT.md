# Test Environment

**Evidence date:** 2026-10-30\
**Status:** **PARTIALLY_IMPLEMENTED** — the full 56-test suite passed, but this Windows host requires a process-scoped workaround; WSL and Docker alternatives were unavailable here.

## Current baseline

Observed local versions:

```text
Node.js v24.19.0, Windows x64
npm 11.17.0
tsx 4.23.15
Vitest 4.1.12
MySQL test schema: frostguard_test
```

The test runner uses `apps/api/vitest.config.mts`; its global setup forcibly resets and seeds the hard-coded `frostguard_test` database, then applies SQL objects. That behavior is destructive to that schema. Use only an empty/disposable local MySQL 8.4 test instance with the configured test credentials. Never point the suite at a database containing data you care about.

Standard commands in a supported environment:

```powershell
npm.cmd ci
npm.cmd run db:generate
npm.cmd test
```

The API integration suite executes real HTTP handlers, Prisma queries and MySQL triggers/procedures. `npm test` invokes the API Vitest workspace. The configuration fixes the test database URL to `mysql://root:root@localhost:3306/frostguard_test`; changing only the caller's `DATABASE_URL` does not redirect the global setup. Change test configuration deliberately if using a different disposable schema, and review the reset semantics first.

## Windows host error

On this host, direct Node inspection reliably reproduced:

```text
node -e "require('node:os').userInfo()"
Error: A system error occurred: uv_os_get_passwd returned ENOMEM (not enough memory)
```

The error occurs in Node's OS account lookup before FROSTGUARD application code. `tsx --version` succeeds, so the symptom is not a general inability to start the `tsx` executable. The cause is not established as actual memory exhaustion; the native `uv_os_get_passwd` result is the observed fact. The test command failed before discovery in the normal Windows process context.

The 56-test pass on this host used an ephemeral Node preload that defines `process.geteuid()` for the test process tree. The file was created under `$env:TEMP`, `NODE_OPTIONS` was restored, and the file was deleted in a `finally` block. The workaround does not modify repository code or production behavior, but it is a host-specific compatibility shim—not a project test runner fix.

Reproduce the same workaround only when necessary, after confirming MySQL is disposable:

```powershell
$preloadPath = Join-Path $env:TEMP ('frostguard-node-geteuid-' + [guid]::NewGuid().ToString('N') + '.cjs')
$previousNodeOptions = $env:NODE_OPTIONS
try {
    Set-Content -LiteralPath $preloadPath -Value "Object.defineProperty(process, 'geteuid', { value: () => 0 });" -Encoding ascii
    if ([string]::IsNullOrWhiteSpace($previousNodeOptions)) {
        $env:NODE_OPTIONS = "--require=$preloadPath"
    } else {
        $env:NODE_OPTIONS = "$previousNodeOptions --require=$preloadPath"
    }
    npm.cmd test
    if ($LASTEXITCODE -ne 0) { throw "Test suite failed with exit code $LASTEXITCODE" }
} finally {
    $env:NODE_OPTIONS = $previousNodeOptions
    if (Test-Path -LiteralPath $preloadPath) { Remove-Item -LiteralPath $preloadPath -Force }
}
```

This shim should not be committed, made a default script, or used in deployed processes.

## Stable alternative environment

The local GitHub Actions workflow specifies Ubuntu, Node 22, and a MySQL 8.4 service, followed by `npm ci`, client generation, migration/SQL validation, typecheck, lint, build, integration tests and browser tests. This is the intended clean reproducible environment. The workflow has not been run remotely because it is not present on the remote default branch, and its local YAML has only been manually inspected. Treat it as a configured candidate, not verified CI evidence.

On a Linux host or WSL2 with MySQL available at `127.0.0.1:3306` using the isolated test credentials:

```bash
node --version   # use Node 22 LTS
npm --version
npm ci
npm run db:generate
npm test
```

This Windows host has `wsl.exe`, but `wsl.exe --status` returned `Wsl/EnumerateDistros/Service/E_ACCESSDENIED`; WSL could not be used. Docker CLI is installed, but no Docker Engine/npipe is running, so a local MySQL service container could not be started. These host blockers do not establish that another developer's WSL/Docker setup is unavailable.

## Test evidence

The full suite passed **12 files / 56 tests** on 2026-10-30 against `frostguard_test` using the temporary preload above. The full Playwright suite passed **3 tests** including the 14-route authenticated smoke; typecheck, lint, and production build also passed. The workaround was removed after execution. No temporary shim exists in the repository.
