import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { classifyRisk } from "../monitoring/excursion.engine";

const DAY = 86_400_000;

export async function getRiskAnalytics(orgId: string) {
  const shipments = await prisma.shipment.findMany({
    where: { orgId, status: { in: ["PLANNED", "DISPATCHED", "IN_TRANSIT", "DELAYED"] } },
    include: {
      excursions: { where: { status: "OPEN" } },
      sensorAssignments: {
        where: { endedAt: null },
        include: { sensor: { include: { readings: { orderBy: { recordedAt: "desc" }, take: 1 } } } },
      },
    },
    orderBy: { riskScore: "desc" },
  });

  const now = Date.now();
  const scored = shipments.map((s) => {
    const reasons: string[] = [];
    let score = s.riskScore;

    const critical = s.excursions.filter((e) => e.severity === "CRITICAL").length;
    const warning = s.excursions.filter((e) => e.severity === "WARNING").length;
    if (critical > 0) {
      score = Math.max(score, 75);
      reasons.push(`${critical} open critical excursion${critical > 1 ? "s" : ""}`);
    }
    if (warning > 0) {
      score = Math.max(score, 45);
      reasons.push(`${warning} open warning excursion${warning > 1 ? "s" : ""}`);
    }

    const readings = s.sensorAssignments.flatMap((a) => a.sensor.readings);
    const lastReading = readings[0];
    if (!lastReading) {
      score = Math.max(score, 40);
      reasons.push("No telemetry received for this shipment");
    } else {
      const ageMinutes = Math.round((now - lastReading.recordedAt.getTime()) / 60_000);
      if (ageMinutes > 60) {
        score = Math.max(score, 35);
        reasons.push(`Telemetry stale for ${ageMinutes} minutes`);
      }
    }

    if (s.estimatedArrivalAt && s.estimatedArrivalAt.getTime() < now && s.status !== "DELIVERED") {
      score = Math.max(score, 55);
      reasons.push("Estimated arrival time exceeded");
    }
    if (reasons.length === 0) reasons.push("Within configured operating parameters");

    score = Math.max(0, Math.min(100, score));
    return {
      id: s.id,
      code: s.code,
      destinationName: s.destinationName,
      status: s.status,
      progressPercent: s.progressPercent,
      riskScore: score,
      riskBand: classifyRisk(score),
      reasons,
      temperature: lastReading ? Number(lastReading.temperature) : null,
      lastReadingAt: lastReading?.recordedAt ?? null,
    };
  });

  const buckets = { LOW: 0, MEDIUM: 0, HIGH: 0, SEVERE: 0 };
  for (const s of scored) buckets[s.riskBand] += 1;

  return { shipments: scored, buckets };
}

export async function getWarehousePerformance(orgId: string, days = 30) {
  const from = new Date(Date.now() - days * DAY);
  return prisma.$queryRaw<
    Array<{ id: string; name: string; city: string | null; units: bigint; batches: bigint; excursions: bigint; avgTemp: string | null }>
  >(Prisma.sql`
    SELECT w.id, w.name, w.city,
      (SELECT COUNT(*) FROM storage_units su WHERE su.warehouseId = w.id) AS units,
      (SELECT COUNT(*) FROM batches b JOIN storage_units s2 ON s2.id = b.storageUnitId WHERE s2.warehouseId = w.id) AS batches,
      (SELECT COUNT(*) FROM temperature_excursions e JOIN storage_units s3 ON s3.id = e.storageUnitId
         WHERE s3.warehouseId = w.id AND e.startedAt >= ${from}) AS excursions,
      (SELECT ROUND(AVG(r.temperature), 2) FROM sensor_readings r
         JOIN sensor_assignments sa ON sa.sensorId = r.sensorId AND sa.endedAt IS NULL
         JOIN storage_units s4 ON s4.id = sa.storageUnitId
         WHERE s4.warehouseId = w.id AND r.recordedAt >= ${from}) AS avgTemp
    FROM warehouses w
    WHERE w.orgId = ${orgId}
    ORDER BY excursions DESC, w.name ASC
  `).then((rows) =>
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      city: r.city,
      units: Number(r.units),
      batches: Number(r.batches),
      excursions: Number(r.excursions),
      averageTemperature: r.avgTemp != null ? Number(r.avgTemp) : null,
    }))
  );
}

export async function getDeviceReliability(orgId: string, days = 7) {
  const from = new Date(Date.now() - days * DAY);
  const expected = days * 24 * 60; // one reading per minute reference
  return prisma.$queryRaw<
    Array<{
      id: string;
      deviceId: string;
      name: string;
      status: string;
      lastSeenAt: Date | null;
      readings: bigint;
      excursions: bigint;
    }>
  >(Prisma.sql`
    SELECT s.id, s.deviceId, s.name, s.status, s.lastSeenAt,
      (SELECT COUNT(*) FROM sensor_readings r WHERE r.sensorId = s.id AND r.recordedAt >= ${from}) AS readings,
      (SELECT COUNT(*) FROM temperature_excursions e WHERE e.sensorId = s.id AND e.startedAt >= ${from}) AS excursions
    FROM sensors s
    WHERE s.orgId = ${orgId}
    ORDER BY readings ASC
  `).then((rows) =>
    rows.map((r) => {
      const readings = Number(r.readings);
      return {
        id: r.id,
        deviceId: r.deviceId,
        name: r.name,
        status: r.status,
        lastSeenAt: r.lastSeenAt,
        readings,
        excursions: Number(r.excursions),
        reliabilityPercent: Math.min(100, Math.round((readings / expected) * 100)),
      };
    })
  );
}

export async function getExpiringBatches(orgId: string, days = 30) {
  return prisma.batch.findMany({
    where: {
      orgId,
      status: { in: ["AVAILABLE", "RESERVED", "QUARANTINE"] },
      expiresAt: { lte: new Date(Date.now() + days * DAY) },
    },
    include: {
      product: { select: { name: true, code: true } },
      storageUnit: { select: { name: true, code: true } },
    },
    orderBy: { expiresAt: "asc" },
    take: 25,
  });
}

export async function getDeliveryPerformance(orgId: string) {
  const from = new Date(Date.now() - 180 * DAY);
  const rows = await prisma.$queryRaw<
    Array<{ month: string; delivered: bigint; onTime: bigint; delayedCount: bigint }>
  >(Prisma.sql`
    SELECT DATE_FORMAT(COALESCE(deliveredAt, createdAt), '%Y-%m') AS month,
           SUM(status = 'DELIVERED') AS delivered,
           SUM(status = 'DELIVERED' AND estimatedArrivalAt IS NOT NULL AND deliveredAt <= estimatedArrivalAt) AS onTime,
           SUM(status = 'DELAYED') AS delayedCount
    FROM shipments
    WHERE orgId = ${orgId} AND COALESCE(deliveredAt, createdAt) >= ${from}
    GROUP BY month
    ORDER BY month ASC
  `);
  return rows.map((r) => ({
    month: r.month,
    delivered: Number(r.delivered),
    onTime: Number(r.onTime),
    delayed: Number(r.delayedCount),
    onTimeRate: Number(r.delivered) ? Math.round((Number(r.onTime) / Number(r.delivered)) * 100) : null,
  }));
}

export async function getAnalytics(orgId: string) {
  const [risk, warehouses, devices, expiring, delivery] = await Promise.all([
    getRiskAnalytics(orgId),
    getWarehousePerformance(orgId),
    getDeviceReliability(orgId),
    getExpiringBatches(orgId),
    getDeliveryPerformance(orgId),
  ]);
  return { risk, warehouses, devices, expiring, delivery };
}
