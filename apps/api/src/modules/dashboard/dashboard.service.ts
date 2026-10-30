import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";

const DAY = 86_400_000;

export async function getOverview(orgId: string) {
  const since30 = new Date(Date.now() - 30 * DAY);
  const [statusCounts, activeExcursions, criticalIncidents, sensorStatus, delivered] = await Promise.all([
    prisma.shipment.groupBy({ by: ["status"], where: { orgId }, _count: { _all: true } }),
    prisma.excursion.count({ where: { orgId, status: "OPEN" } }),
    prisma.incident.count({
      where: { orgId, severity: "CRITICAL", status: { in: ["OPEN", "ACKNOWLEDGED", "INVESTIGATING"] } },
    }),
    prisma.sensor.groupBy({ by: ["status"], where: { orgId }, _count: { _all: true } }),
    prisma.shipment.findMany({
      where: { orgId, status: "DELIVERED", deliveredAt: { gte: since30 } },
      select: { deliveredAt: true, estimatedArrivalAt: true },
    }),
  ]);

  const shipmentByStatus = Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all]));
  const activeShipments =
    (shipmentByStatus.DISPATCHED ?? 0) + (shipmentByStatus.IN_TRANSIT ?? 0) + (shipmentByStatus.DELAYED ?? 0);

  const risky = await prisma.shipment.findMany({
    where: { orgId, status: { in: ["DISPATCHED", "IN_TRANSIT", "DELAYED"] } },
    select: { riskScore: true, _count: { select: { excursions: { where: { status: "OPEN" } } } } },
  });
  const safeShipments = risky.filter((s) => s.riskScore < 50 && s._count.excursions === 0).length;

  const openExcursionUnits = await prisma.excursion.findMany({
    where: { orgId, status: "OPEN" },
    select: { storageUnitId: true, shipmentId: true },
  });
  const unitIds = openExcursionUnits.map((e) => e.storageUnitId).filter((v): v is string => Boolean(v));
  const shipmentIds = openExcursionUnits.map((e) => e.shipmentId).filter((v): v is string => Boolean(v));

  const atRiskBatches = await prisma.batch.count({
    where: {
      orgId,
      status: { in: ["AVAILABLE", "RESERVED"] },
      OR: [
        ...(unitIds.length ? [{ storageUnitId: { in: unitIds } }] : []),
        ...(shipmentIds.length ? [{ shipmentItems: { some: { shipmentId: { in: shipmentIds } } } }] : []),
        { expiresAt: { lte: new Date(Date.now() + 14 * DAY) } },
      ],
    },
  });

  const sensorByStatus = Object.fromEntries(sensorStatus.map((s) => [s.status, s._count._all]));
  const onTime = delivered.filter(
    (d) => d.estimatedArrivalAt && d.deliveredAt && d.deliveredAt <= d.estimatedArrivalAt
  ).length;

  return {
    kpis: {
      activeShipments,
      safeShipments,
      activeExcursions,
      criticalIncidents,
      connectedDevices: sensorByStatus.ONLINE ?? 0,
      offlineDevices: sensorByStatus.OFFLINE ?? 0,
      atRiskBatches,
      onTimeDeliveries: onTime,
      deliveredShipments30d: delivered.length,
      onTimeRate: delivered.length ? Math.round((onTime / delivered.length) * 100) : null,
    },
    shipmentByStatus,
    sensorByStatus,
  };
}

export async function getTemperatureTrend(orgId: string, hours = 24) {
  const from = new Date(Date.now() - hours * 3600_000);
  const bucket = 30 * 60;
  return prisma.$queryRaw<Array<{ bucketStart: number | bigint; avg: string; min: string; max: string; count: bigint }>>(
    Prisma.sql`
      SELECT FLOOR(UNIX_TIMESTAMP(recordedAt) / ${bucket}) * ${bucket} AS bucketStart,
             AVG(temperature) AS avg, MIN(temperature) AS min, MAX(temperature) AS max, COUNT(*) AS count
      FROM sensor_readings
      WHERE orgId = ${orgId} AND recordedAt >= ${from}
      GROUP BY bucketStart
      ORDER BY bucketStart ASC
    `
  ).then((rows) =>
    rows.map((r) => ({
      bucketStart: new Date(Number(r.bucketStart) * 1000).toISOString(),
      avg: Number(Number(r.avg).toFixed(2)),
      min: Number(Number(r.min).toFixed(2)),
      max: Number(Number(r.max).toFixed(2)),
      count: Number(r.count),
    }))
  );
}

export async function getExcursionFrequency(orgId: string, days = 14) {
  const from = new Date(Date.now() - days * DAY);
  const rows = await prisma.$queryRaw<Array<{ day: string; total: bigint; critical: bigint }>>(
    Prisma.sql`
      SELECT DATE_FORMAT(startedAt, '%Y-%m-%d') AS day,
             COUNT(*) AS total,
             SUM(severity = 'CRITICAL') AS critical
      FROM temperature_excursions
      WHERE orgId = ${orgId} AND startedAt >= ${from}
      GROUP BY day
      ORDER BY day ASC
    `
  );
  return rows.map((r) => ({ day: r.day, total: Number(r.total), critical: Number(r.critical) }));
}

export async function getAlertSeverity(orgId: string, days = 30) {
  const rows = await prisma.alert.groupBy({
    by: ["severity"],
    where: { orgId, createdAt: { gte: new Date(Date.now() - days * DAY) } },
    _count: { _all: true },
  });
  return rows.map((r) => ({ severity: r.severity, count: r._count._all }));
}

export async function getWarehousePerformance(orgId: string, days = 30) {
  const from = new Date(Date.now() - days * DAY);
  return prisma.$queryRaw<
    Array<{
      id: string;
      name: string;
      city: string | null;
      units: bigint;
      batches: bigint;
      excursions: bigint;
      averageTemperature: string | null;
    }>
  >(Prisma.sql`
    SELECT w.id, w.name, w.city,
      (SELECT COUNT(*) FROM storage_units su WHERE su.warehouseId = w.id) AS units,
      (SELECT COUNT(*) FROM batches b JOIN storage_units su2 ON su2.id = b.storageUnitId WHERE su2.warehouseId = w.id) AS batches,
      (SELECT COUNT(*) FROM temperature_excursions e JOIN storage_units su3 ON su3.id = e.storageUnitId
        WHERE su3.warehouseId = w.id AND e.startedAt >= ${from}) AS excursions,
      (SELECT ROUND(AVG(r.temperature), 2) FROM sensor_readings r
        JOIN sensor_assignments sa ON sa.sensorId = r.sensorId AND sa.endedAt IS NULL
        JOIN storage_units su4 ON su4.id = sa.storageUnitId
        WHERE su4.warehouseId = w.id AND r.recordedAt >= ${from}) AS averageTemperature
    FROM warehouses w
    WHERE w.orgId = ${orgId}
    ORDER BY w.name ASC
  `).then((rows) =>
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      city: r.city,
      units: Number(r.units),
      batches: Number(r.batches),
      excursions: Number(r.excursions),
      averageTemperature: r.averageTemperature != null ? Number(r.averageTemperature) : null,
    }))
  );
}

export async function getRiskByShipment(orgId: string) {
  return prisma.shipment.findMany({
    where: { orgId, status: { in: ["PLANNED", "DISPATCHED", "IN_TRANSIT", "DELAYED"] } },
    select: {
      id: true,
      code: true,
      destinationName: true,
      status: true,
      riskScore: true,
      progressPercent: true,
      excursions: { where: { status: "OPEN" }, select: { severity: true } },
    },
    orderBy: { riskScore: "desc" },
    take: 20,
  });
}

export async function getRecentActivity(orgId: string) {
  const [audit, alerts] = await Promise.all([
    prisma.auditLog.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: { actor: { select: { fullName: true } } },
    }),
    prisma.alert.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { excursion: { include: { sensor: { select: { name: true } } } } },
    }),
  ]);
  return { audit, alerts };
}

export async function getTopRiskUnits(orgId: string) {
  return prisma.$queryRaw<
    Array<{ id: string; name: string; warehouse: string; excursions: bigint; open: bigint; lastTemp: string | null }>
  >(Prisma.sql`
    SELECT su.id, su.name, w.name AS warehouse,
      COUNT(e.id) AS excursions,
      SUM(e.status = 'OPEN') AS open,
      (SELECT r.temperature FROM sensor_readings r
        JOIN sensor_assignments sa ON sa.sensorId = r.sensorId AND sa.endedAt IS NULL
        WHERE sa.storageUnitId = su.id
        ORDER BY r.recordedAt DESC LIMIT 1) AS lastTemp
    FROM storage_units su
    JOIN warehouses w ON w.id = su.warehouseId
    LEFT JOIN temperature_excursions e ON e.storageUnitId = su.id AND e.startedAt >= ${new Date(Date.now() - 30 * DAY)}
    WHERE su.orgId = ${orgId}
    GROUP BY su.id, su.name, w.name
    ORDER BY excursions DESC, open DESC
    LIMIT 6
  `).then((rows) =>
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      warehouse: r.warehouse,
      excursions: Number(r.excursions),
      open: Number(r.open ?? 0),
      lastTemp: r.lastTemp != null ? Number(r.lastTemp) : null,
    }))
  );
}

export async function getDashboard(orgId: string) {
  const [overview, trend, excursionFrequency, alertSeverity, warehousePerformance, risk, activity, topUnits, latest] =
    await Promise.all([
      getOverview(orgId),
      getTemperatureTrend(orgId, 24),
      getExcursionFrequency(orgId, 14),
      getAlertSeverity(orgId, 30),
      getWarehousePerformance(orgId, 30),
      getRiskByShipment(orgId),
      getRecentActivity(orgId),
      getTopRiskUnits(orgId),
      prisma.sensorReading.findMany({
        where: { orgId },
        orderBy: { recordedAt: "desc" },
        take: 8,
        include: { sensor: { select: { id: true, name: true, deviceId: true } } },
      }),
    ]);

  return {
    ...overview,
    temperatureTrend: trend,
    excursionFrequency,
    alertSeverity,
    warehousePerformance,
    riskByShipment: risk,
    activity,
    topRiskUnits: topUnits,
    latestReadings: latest,
  };
}
