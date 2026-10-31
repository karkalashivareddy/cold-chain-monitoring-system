import { Prisma } from "@prisma/client";
import type { TelemetryReadingInput } from "@frostguard/shared";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { writeAudit } from "../../services/audit";
import { verifyDeviceKey } from "../../security/deviceAuth";
import { calculateRiskScore, evaluateTemperature, resolveProfile } from "../monitoring/excursion.engine";

export type IngestOptions = {
  deviceKey?: string;
  internal?: boolean;
  ip?: string;
  requestId?: string;
};

export type IngestResult = {
  duplicate: boolean;
  outOfOrder?: boolean;
  readingId?: string;
  evaluation?: ReturnType<typeof evaluateTemperature>;
  excursionId?: string | null;
  alertId?: string | null;
  incidentId?: string | null;
  message: string;
};

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export async function ingestReading(input: TelemetryReadingInput, opts: IngestOptions): Promise<IngestResult> {
  const sensor = await prisma.sensor.findUnique({
    where: { deviceId: input.deviceId.toUpperCase() },
  });

  // Uniform failure: never reveal whether a device id exists.
  if (!sensor) throw new AppError(401, "DEVICE_AUTH_FAILED", "Device authentication failed");
  if (!opts.internal) {
    if (!opts.deviceKey || !verifyDeviceKey(sensor.apiKeyHash, opts.deviceKey)) {
      throw new AppError(401, "DEVICE_AUTH_FAILED", "Device authentication failed");
    }
  }
  if (sensor.status === "REVOKED") {
    throw new AppError(401, "DEVICE_AUTH_FAILED", "Device credential revoked");
  }

  const recordedAt = new Date(input.recordedAt);
  const now = Date.now();
  if (recordedAt.getTime() > now + FUTURE_TOLERANCE_MS) {
    throw AppError.badRequest("Recorded timestamp is in the future");
  }
  if (recordedAt.getTime() < now - MAX_AGE_MS) {
    throw AppError.badRequest("Recorded timestamp is older than the accepted retention window");
  }

  try {
    return await prisma.$transaction(
      async (tx) => {
        // Serialize ingestion for one sensor before looking at its latest
        // sequence. Delayed readings remain in immutable history but cannot
        // regress current excursion state.
        const lockedSensor = await tx.$queryRawUnsafe<Array<{ id: string }>>(
          "SELECT id FROM sensors WHERE id = ? FOR UPDATE",
          sensor.id
        );
        if (lockedSensor.length === 0) {
          throw new AppError(401, "DEVICE_AUTH_FAILED", "Device authentication failed");
        }
        const currentSensor = await tx.sensor.findUnique({ where: { id: sensor.id } });
        if (
          !currentSensor ||
          currentSensor.status === "REVOKED" ||
          (!opts.internal &&
            (!opts.deviceKey || !verifyDeviceKey(currentSensor.apiKeyHash, opts.deviceKey)))
        ) {
          throw new AppError(401, "DEVICE_AUTH_FAILED", "Device authentication failed");
        }
        const assignment = await tx.sensorAssignment.findFirst({
          where: { sensorId: sensor.id, endedAt: null },
          orderBy: { startedAt: "desc" },
          select: { storageUnitId: true, shipmentId: true },
        });
        const target = {
          storageUnitId: assignment?.storageUnitId ?? null,
          shipmentId: assignment?.shipmentId ?? null,
        };
        const latestReading = await tx.sensorReading.findFirst({
          where: { sensorId: sensor.id, bootId: input.bootId },
          orderBy: { sequenceNumber: "desc" },
          select: { sequenceNumber: true },
        });
        const outOfOrder =
          latestReading !== null && input.sequenceNumber < latestReading.sequenceNumber;

        const reading = await tx.sensorReading.create({
          data: {
            orgId: sensor.orgId,
            sensorId: sensor.id,
            temperature: new Prisma.Decimal(input.temperature.toFixed(2)),
            humidity: input.humidity != null ? new Prisma.Decimal(input.humidity.toFixed(2)) : null,
            recordedAt,
            bootId: input.bootId,
            sequenceNumber: input.sequenceNumber,
            // Only trusted internal simulator calls can mark synthetic data.
            isSimulated: Boolean(opts.internal),
            source: opts.internal ? "SIMULATOR" : "DEVICE",
          },
        });

        await tx.sensor.update({
          where: { id: sensor.id },
          data: {
            lastSeenAt: new Date(),
            status: currentSensor.status === "MAINTENANCE" ? "MAINTENANCE" : "ONLINE",
          },
        });

        const profile = await resolveProfile(tx, { orgId: sensor.orgId, target });
        const evaluation = evaluateTemperature(input.temperature, profile);
        const targetKey = target.shipmentId
          ? `shipment:${target.shipmentId}`
          : target.storageUnitId
            ? `unit:${target.storageUnitId}`
            : `sensor:${sensor.id}`;

        const openExcursion = await tx.excursion.findFirst({
          where: { sensorId: sensor.id, status: "OPEN" },
        });

        let excursionId: string | null = openExcursion?.id ?? null;
        let alertId: string | null = null;
        let incidentId: string | null = null;

        if (!outOfOrder && evaluation.isOutOfRange && profile) {
          if (openExcursion) {
            const min = Math.min(Number(openExcursion.minTemp), input.temperature);
            const max = Math.max(Number(openExcursion.maxTemp), input.temperature);
            await tx.excursion.update({
              where: { id: openExcursion.id },
              data: {
                minTemp: new Prisma.Decimal(min.toFixed(2)),
                maxTemp: new Prisma.Decimal(max.toFixed(2)),
                durationSeconds: Math.floor((Date.now() - openExcursion.startedAt.getTime()) / 1000),
                readingsCount: { increment: 1 },
                severity: evaluation.isCritical ? "CRITICAL" : openExcursion.severity,
              },
            });
            await tx.outboxEvent.create({
              data: {
                orgId: sensor.orgId,
                topic: "excursion:updated",
                payload: { excursionId: openExcursion.id, temperature: input.temperature },
              },
            });
          } else {
            // Persistence rule: require N consecutive out-of-range readings.
            const previous = await tx.sensorReading.findMany({
              where: { sensorId: sensor.id, bootId: input.bootId, sequenceNumber: { lt: input.sequenceNumber } },
              orderBy: { sequenceNumber: "desc" },
              take: Math.max(0, profile.persistenceReadings - 1),
            });
            const previousOutOfRange = previous.every((r) => {
              const t = Number(r.temperature);
              return t < profile.minTemp || t > profile.maxTemp;
            });
            const persisted =
              profile.persistenceReadings <= 1 ||
              (previous.length === profile.persistenceReadings - 1 && previousOutOfRange);

            if (persisted) {
              const severity = evaluation.isCritical ? "CRITICAL" : "WARNING";
              const minuteBucket = new Date(recordedAt).toISOString().slice(0, 16);
              const dedupeKey = `${sensor.id}:${input.bootId}:${targetKey}:${severity}:${minuteBucket}`;
              const excursion = await tx.excursion.create({
                data: {
                  orgId: sensor.orgId,
                  sensorId: sensor.id,
                  storageUnitId: target.storageUnitId,
                  shipmentId: target.shipmentId,
                  type: severity,
                  severity,
                  status: "OPEN",
                  startedAt: recordedAt,
                  minTemp: new Prisma.Decimal(input.temperature.toFixed(2)),
                  maxTemp: new Prisma.Decimal(input.temperature.toFixed(2)),
                  readingsCount: 1,
                  peakReadingId: reading.id,
                  dedupeKey,
                },
              });
              excursionId = excursion.id;

              const where = target.shipmentId
                ? `shipment ${target.shipmentId}`
                : target.storageUnitId
                  ? `storage unit ${target.storageUnitId}`
                  : `device ${sensor.deviceId}`;
              const title =
                severity === "CRITICAL"
                  ? `Critical temperature excursion on ${sensor.name}`
                  : `Temperature excursion on ${sensor.name}`;
              const message = `${input.temperature.toFixed(2)} °C recorded against a permitted range of ${profile.minTemp.toFixed(1)}–${profile.maxTemp.toFixed(1)} °C (${where}).`;

              const alert = await tx.alert.create({
                data: {
                  orgId: sensor.orgId,
                  excursionId: excursion.id,
                  type: "TEMPERATURE_EXCURSION",
                  severity,
                  title,
                  message,
                  dedupeKey: `alert:${dedupeKey}`,
                },
              });
              alertId = alert.id;

              if (severity === "CRITICAL") {
                const recurrence = await tx.excursion.count({
                  where: { sensorId: sensor.id, startedAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
                });
                const riskScore = calculateRiskScore({
                  severity,
                  deviation: evaluation.deviation,
                  durationMinutes: 1,
                  repeatedExcursions: recurrence,
                  missingTelemetry: false,
                });
                const incident = await tx.incident.create({
                  data: {
                    orgId: sensor.orgId,
                    code: `INC-${Date.now().toString(36).toUpperCase()}`,
                    alertId: alert.id,
                    excursionId: excursion.id,
                    title,
                    description: message,
                    severity: "CRITICAL",
                    riskScore,
                  },
                });
                incidentId = incident.id;
                await tx.outboxEvent.create({
                  data: { orgId: sensor.orgId, topic: "incident:created", payload: { incidentId: incident.id, code: incident.code } },
                });
              }

              if (target.shipmentId) {
                await tx.shipment.update({
                  where: { id: target.shipmentId },
                  data: { riskScore: evaluation.isCritical ? 80 : 50 },
                });
              }

              await writeAudit(tx, {
                orgId: sensor.orgId,
                action: "excursion.opened",
                entityType: "excursion",
                entityId: excursion.id,
                metadata: {
                  sensorId: sensor.id,
                  temperature: input.temperature,
                  permitted: [profile.minTemp, profile.maxTemp],
                  severity,
                },
                requestId: opts.requestId,
                ip: opts.ip,
              });
              await tx.outboxEvent.create({
                data: {
                  orgId: sensor.orgId,
                  topic: "alert:created",
                  payload: { alertId: alert.id, severity, title },
                },
              });
            }
          }
        } else if (!outOfOrder && openExcursion && !evaluation.isOutOfRange) {
          // Recovery: close the excursion, resolve its open alerts.
          const endedAt = new Date();
          await tx.excursion.update({
            where: { id: openExcursion.id },
            data: {
              status: "RECOVERED",
              endedAt,
              durationSeconds: Math.floor((endedAt.getTime() - openExcursion.startedAt.getTime()) / 1000),
              readingsCount: { increment: 1 },
            },
          });
          await tx.alert.updateMany({
            where: { excursionId: openExcursion.id, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
            data: { status: "RESOLVED", resolvedAt: endedAt },
          });
          await tx.outboxEvent.create({
            data: { orgId: sensor.orgId, topic: "excursion:updated", payload: { excursionId: openExcursion.id, status: "RECOVERED" } },
          });
        }

        await tx.outboxEvent.create({
          data: {
            orgId: sensor.orgId,
            topic: "sensor:reading",
            payload: {
              sensorId: sensor.id,
              deviceId: sensor.deviceId,
              temperature: input.temperature,
              humidity: input.humidity ?? null,
              recordedAt: recordedAt.toISOString(),
              bootId: input.bootId,
              state: outOfOrder ? "STALE" : evaluation.state,
              isSimulated: Boolean(opts.internal),
              outOfOrder,
              shipmentId: target.shipmentId,
              storageUnitId: target.storageUnitId,
            },
          },
        });

        return {
          duplicate: false,
          outOfOrder,
          readingId: reading.id.toString(),
          evaluation,
          excursionId,
          alertId,
          incidentId,
          message: outOfOrder
            ? "Delayed reading stored as historical telemetry; live excursion state was not changed."
            : evaluation.isOutOfRange
            ? `Reading stored; ${evaluation.state.toLowerCase()} excursion state.`
            : "Reading stored within permitted range.",
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15_000 }
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = err.meta?.target;
      const targetText = Array.isArray(target) ? target.join(" ") : String(target ?? "");
      const expected = ["sensorId", "bootId", "sequenceNumber"].every((field) => targetText.includes(field));
      if (!expected) throw err;
      // A sequence is replay-protected within the originating device boot.
      return { duplicate: true, message: "Duplicate boot and sequence pair ignored (idempotent replay)." };
    }
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/*  Queries                                                                  */
/* -------------------------------------------------------------------------- */

export async function listReadings(params: {
  orgId: string;
  page: number;
  pageSize: number;
  sensorId?: string;
  storageUnitId?: string;
  shipmentId?: string;
  from?: Date;
  to?: Date;
  simulated?: boolean;
}) {
  const where: Prisma.SensorReadingWhereInput = {
    orgId: params.orgId,
    ...(params.sensorId ? { sensorId: params.sensorId } : {}),
    ...(params.simulated !== undefined ? { isSimulated: params.simulated } : {}),
    ...(params.from || params.to
      ? { recordedAt: { ...(params.from ? { gte: params.from } : {}), ...(params.to ? { lte: params.to } : {}) } }
      : {}),
    ...(params.storageUnitId || params.shipmentId
      ? {
          sensor: {
            assignments: {
              some: {
                ...(params.storageUnitId ? { storageUnitId: params.storageUnitId } : {}),
                ...(params.shipmentId ? { shipmentId: params.shipmentId } : {}),
              },
            },
          },
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.sensorReading.findMany({
      where,
      include: { sensor: { select: { id: true, deviceId: true, name: true } } },
      orderBy: { recordedAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.sensorReading.count({ where }),
  ]);
  return { items, total };
}

export type SeriesPoint = {
  bucketStart: string;
  avg: number;
  min: number;
  max: number;
  count: number;
  simulated: number;
};

export async function getTemperatureSeries(params: {
  orgId: string;
  sensorId: string;
  from: Date;
  to: Date;
  bucketMinutes: number;
}): Promise<SeriesPoint[]> {
  const sensor = await prisma.sensor.findFirst({ where: { id: params.sensorId, orgId: params.orgId } });
  if (!sensor) throw AppError.notFound("Sensor not found");

  const bucketSeconds = Math.max(10, params.bucketMinutes * 60);
  const rows = await prisma.$queryRaw<
    Array<{ bucketStart: number | bigint; avg: string; min: string; max: string; count: bigint; simulated: bigint }>
  >(Prisma.sql`
    SELECT
      FLOOR(UNIX_TIMESTAMP(recordedAt) / ${bucketSeconds}) * ${bucketSeconds} AS bucketStart,
      AVG(temperature) AS avg,
      MIN(temperature) AS min,
      MAX(temperature) AS max,
      COUNT(*) AS count,
      SUM(isSimulated) AS simulated
    FROM sensor_readings
    WHERE orgId = ${params.orgId}
      AND sensorId = ${params.sensorId}
      AND recordedAt >= ${params.from}
      AND recordedAt <= ${params.to}
    GROUP BY bucketStart
    ORDER BY bucketStart ASC
  `);

  return rows.map((r) => ({
    bucketStart: new Date(Number(r.bucketStart) * 1000).toISOString(),
    avg: Number(Number(r.avg).toFixed(2)),
    min: Number(Number(r.min).toFixed(2)),
    max: Number(Number(r.max).toFixed(2)),
    count: Number(r.count),
    simulated: Number(r.simulated),
  }));
}

export async function latestReadings(orgId: string, limit = 12) {
  return prisma.$queryRaw<
    Array<{
      sensorId: string;
      deviceId: string;
      name: string;
      temperature: string;
      recordedAt: Date;
      isSimulated: number;
      status: string;
      storageUnit: string | null;
      shipment: string | null;
    }>
  >(Prisma.sql`
    SELECT r.sensorId, s.deviceId, s.name, r.temperature, r.recordedAt, r.isSimulated, s.status,
           su.name AS storageUnit, sh.code AS shipment
    FROM sensor_readings r
    JOIN sensors s ON s.id = r.sensorId
    LEFT JOIN sensor_assignments sa ON sa.sensorId = s.id AND sa.endedAt IS NULL
    LEFT JOIN storage_units su ON su.id = sa.storageUnitId
    LEFT JOIN shipments sh ON sh.id = sa.shipmentId
    JOIN (
      SELECT sensorId, MAX(id) AS latestId
      FROM sensor_readings
      WHERE orgId = ${orgId}
      GROUP BY sensorId
    ) latest ON latest.sensorId = r.sensorId AND latest.latestId = r.id
    WHERE r.orgId = ${orgId}
    ORDER BY r.recordedAt DESC
    LIMIT ${limit}
  `);
}
