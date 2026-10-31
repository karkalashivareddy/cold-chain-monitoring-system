# MySQL backup and restore runbook

**Status:** instructions only. No production backup target is configured and no restore drill has been run.

## Scope and safety

Use a MySQL 8 client compatible with the server version. Run backup from a trusted host, store the dump in encrypted access-controlled storage outside this repository, and inject credentials through an approved secret mechanism. Do not place passwords on command lines, check dumps into Git, or restore into a valuable database during local testing. Test restore only into a newly created disposable schema.

The examples below use placeholders and a local service name; replace host/database/user through your own environment or client option file. Avoid shell history leakage. `mysqldump --single-transaction` gives a transactionally consistent snapshot for InnoDB tables. This project also has triggers, stored routines and views, so retain routines and triggers and verify them after restore.

## Local logical backup

From a MySQL client environment with credentials already provided securely:

```sh
mysqldump --host=127.0.0.1 --port=3306 --user=DB_USER \
  --single-transaction --routines --triggers --events \
  --hex-blob --default-character-set=utf8mb4 DB_NAME > frostguard-YYYYMMDD-HHMMSS.sql
```

Compress and encrypt the file using the operating system or organization-approved tooling. Record the database version, schema name, backup time (UTC), encryption-key identifier and operator in a separate protected inventory. Do not record credentials in that inventory.

## Restore to a disposable target

1. Create an empty, uniquely named test schema in a disposable MySQL instance.
2. Confirm the dump file checksum and encryption/decryption process.
3. Import using a credential-protected client configuration, for example `mysql --host=... --user=DB_USER TEST_SCHEMA < frostguard-...sql`.
4. Run `npm run db:sql -w @frostguard/api` only if you intentionally created a schema from Prisma rather than restoring a complete dump; do not blindly reapply SQL constraints on a restored database.
5. Compare required table/view/trigger/procedure counts with `database/sql/` and `docs/DATABASE.md`.
6. Run health/readiness and the API/MySQL integration suite against the disposable target only. The test suite currently force-resets the fixed `frostguard_test` database, so never point it at a valuable schema.
7. Document restore duration, missing objects, row-count checks and evidence; delete the disposable instance when its owner permits.

## Recovery and operations limitations

- No automated backup schedule, offsite retention, point-in-time recovery, encryption-key escrow, restore automation or disaster-recovery RTO/RPO is configured.
- No backup/restore drill has been executed for this repository.
- Before production use, select a managed/self-hosted backup method, define retention and RPO/RTO, test restore against a disposable environment, reconcile telemetry/outbox/audit data, and document operator authorization.
- A backup is sensitive operational data. Do not publish it in issues, CI artifacts or screenshots.
