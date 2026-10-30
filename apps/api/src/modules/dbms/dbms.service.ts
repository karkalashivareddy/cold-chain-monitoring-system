import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { callProcedure } from "../../lib/sql";
import { sha256 } from "../../security/tokens";

export type DbmsOverview = {
  database: string;
  tables: number;
  views: number;
  triggers: number;
  procedures: number;
  indexes: number;
  rows: number;
};

export async function getOverview(): Promise<DbmsOverview> {
  const db = process.env.DATABASE_URL?.split("/").pop() ?? "frostguard";
  const [tables, views, triggers, procedures, indexes, rowCount] = await Promise.all([
    prisma.$queryRaw<Array<{ n: bigint }>>(
      Prisma.sql`SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'`
    ),
    prisma.$queryRaw<Array<{ n: bigint }>>(
      Prisma.sql`SELECT COUNT(*) AS n FROM information_schema.views WHERE table_schema = DATABASE()`
    ),
    prisma.$queryRaw<Array<{ n: bigint }>>(
      Prisma.sql`SELECT COUNT(*) AS n FROM information_schema.triggers WHERE trigger_schema = DATABASE()`
    ),
    prisma.$queryRaw<Array<{ n: bigint }>>(
      Prisma.sql`SELECT COUNT(*) AS n FROM information_schema.routines WHERE routine_schema = DATABASE()`
    ),
    prisma.$queryRaw<Array<{ n: bigint }>>(
      Prisma.sql`SELECT COUNT(DISTINCT index_name) AS n FROM information_schema.statistics WHERE table_schema = DATABASE()`
    ),
    prisma.$queryRaw<Array<{ n: bigint | null }>>(
      Prisma.sql`SELECT SUM(table_rows) AS n FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'`
    ),
  ]);

  return {
    database: db.split("?")[0] ?? "frostguard",
    tables: Number(tables[0]?.n ?? 0),
    views: Number(views[0]?.n ?? 0),
    triggers: Number(triggers[0]?.n ?? 0),
    procedures: Number(procedures[0]?.n ?? 0),
    indexes: Number(indexes[0]?.n ?? 0),
    rows: Number(rowCount[0]?.n ?? 0),
  };
}

export async function getTableStats() {
  return prisma.$queryRaw<
    Array<{
      tableName: string;
      tableRows: bigint;
      dataLength: bigint;
      indexLength: bigint;
      engine: string | null;
      collation: string | null;
    }>
  >(Prisma.sql`
    SELECT table_name AS tableName, table_rows AS tableRows, data_length AS dataLength,
           index_length AS indexLength, engine, table_collation AS collation
    FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'
    ORDER BY table_rows DESC
  `).then((rows) =>
    rows.map((r) => ({
      tableName: r.tableName,
      tableRows: Number(r.tableRows),
      dataLengthKb: Math.round(Number(r.dataLength) / 102.4) / 10,
      indexLengthKb: Math.round(Number(r.indexLength) / 102.4) / 10,
      engine: r.engine,
      collation: r.collation,
    }))
  );
}

export async function getViews() {
  return prisma.$queryRaw<Array<{ name: string; definition: string }>>(
    Prisma.sql`SELECT table_name AS name, view_definition AS definition
      FROM information_schema.views WHERE table_schema = DATABASE() ORDER BY table_name`
  );
}

export async function getTriggers() {
  return prisma.$queryRaw<
    Array<{ name: string; event: string; table: string; timing: string; statement: string }>
  >(Prisma.sql`
    SELECT trigger_name AS name, event_manipulation AS event, event_object_table AS \`table\`,
           action_timing AS timing, action_statement AS statement
    FROM information_schema.triggers WHERE trigger_schema = DATABASE()
    ORDER BY event_object_table, trigger_name
  `);
}

export async function getRoutines() {
  return prisma.$queryRaw<Array<{ name: string; type: string; body: string }>>(
    Prisma.sql`SELECT routine_name AS name, routine_type AS type, routine_definition AS body
      FROM information_schema.routines WHERE routine_schema = DATABASE() ORDER BY routine_name`
  );
}

export type ExplainQuery = "telemetry-range" | "open-excursions" | "shipment-risk" | "device-health";

export async function explain(query: ExplainQuery, orgId: string) {
  switch (query) {
    case "telemetry-range": {
      const plan = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        EXPLAIN FORMAT=JSON
        SELECT temperature, recordedAt FROM sensor_readings
        WHERE orgId = ${orgId} AND recordedAt >= ${new Date(Date.now() - 86_400_000)}
        ORDER BY recordedAt DESC LIMIT 500
      `);
      return plan;
    }
    case "open-excursions": {
      return prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        EXPLAIN FORMAT=JSON
        SELECT id, severity, startedAt FROM temperature_excursions
        WHERE orgId = ${orgId} AND status = 'OPEN' ORDER BY startedAt DESC
      `);
    }
    case "shipment-risk": {
      return prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        EXPLAIN FORMAT=JSON
        SELECT code, status, riskScore FROM shipments
        WHERE orgId = ${orgId} AND status IN ('DISPATCHED', 'IN_TRANSIT', 'DELAYED')
        ORDER BY riskScore DESC
      `);
    }
    case "device-health": {
      return prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        EXPLAIN FORMAT=JSON
        SELECT sensorId, minutesSinceReading FROM v_device_health
        WHERE orgId = ${orgId} ORDER BY minutesSinceReading DESC
      `);
    }
  }
}

/**
 * Demonstrates real transactional atomicity: a row is written inside a
 * transaction which is then deliberately rolled back. The post-condition is
 * counted from the database, not assumed in application memory.
 */
export async function verifyRollback(orgId: string, actorId: string) {
  const key = `rollback-demo-${crypto.randomUUID()}`;
  const scope = "dbms-demo";
  let insertedInsideTransaction = false;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.idempotencyRecord.create({
        data: {
          orgId,
          scope,
          key,
          requestHash: sha256(`${actorId}:${key}`),
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      insertedInsideTransaction = true;
      throw new Error("FROSTGUARD_DEMO_ROLLBACK");
    });
  } catch (err) {
    if (!(err instanceof Error) || err.message !== "FROSTGUARD_DEMO_ROLLBACK") throw err;
  }

  const rowsAfterRollback = await prisma.idempotencyRecord.count({ where: { scope, key } });
  return {
    key,
    insertedInsideTransaction,
    rowsAfterRollback,
    atomic: insertedInsideTransaction && rowsAfterRollback === 0,
    explanation:
      "A row was created inside an InnoDB transaction and the transaction was then rolled back. " +
      "The follow-up SELECT proves the write never became visible.",
  };
}

export async function incidentSummary(orgId: string) {
  return callProcedure<{
    status: string;
    severity: string;
    total: number | bigint;
    averageRiskScore: string | number | null;
    oldestOpenedAt: Date | null;
  }>("sp_incident_summary", [orgId]);
}

/**
 * Read-only EXPLAIN of the stock-reservation statement, using a batch that
 * belongs to the caller's organization. The actual reservation procedure is
 * exercised by the shipment dispatch integration test.
 */
export async function explainReservation(orgId: string) {
  const batch = await prisma.batch.findFirst({ where: { orgId }, select: { id: true } });
  if (!batch) return [];
  return prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    EXPLAIN FORMAT=JSON
    SELECT remainingQuantity, status FROM batches WHERE id = ${batch.id} FOR UPDATE
  `);
}
