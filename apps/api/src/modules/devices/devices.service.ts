import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { writeAudit } from "../../services/audit";
import { issueDeviceKey } from "../../security/deviceAuth";
import type { DeviceInput } from "@frostguard/shared";

type ListArgs = {
  orgId: string;
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  storageUnitId?: string;
  shipmentId?: string;
};

export async function listDevices(args: ListArgs) {
  const where: Prisma.SensorWhereInput = {
    orgId: args.orgId,
    ...(args.status ? { status: args.status } : {}),
    ...(args.search
      ? { OR: [{ deviceId: { contains: args.search } }, { name: { contains: args.search } }, { model: { contains: args.search } }] }
      : {}),
    ...(args.storageUnitId || args.shipmentId
      ? {
          assignments: {
            some: {
              endedAt: null,
              ...(args.storageUnitId ? { storageUnitId: args.storageUnitId } : {}),
              ...(args.shipmentId ? { shipmentId: args.shipmentId } : {}),
            },
          },
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.sensor.findMany({
      where,
      include: {
        assignments: {
          where: { endedAt: null },
          take: 1,
          include: {
            storageUnit: { select: { id: true, code: true, name: true } },
            shipment: { select: { id: true, code: true, status: true } },
          },
        },
        readings: { orderBy: { recordedAt: "desc" }, take: 1 },
        _count: { select: { excursions: true } },
      },
      orderBy: { name: "asc" },
      skip: (args.page - 1) * args.pageSize,
      take: args.pageSize,
    }),
    prisma.sensor.count({ where }),
  ]);
  // Never return credential material in list responses.
  return { items: items.map(({ apiKeyHash: _h, ...s }) => s), total };
}

export async function getDevice(orgId: string, id: string) {
  const sensor = await prisma.sensor.findFirst({
    where: { id, orgId },
    include: {
      assignments: {
        orderBy: { startedAt: "desc" },
        take: 10,
        include: {
          storageUnit: { select: { id: true, code: true, name: true } },
          shipment: { select: { id: true, code: true, status: true } },
        },
      },
      readings: { orderBy: { recordedAt: "desc" }, take: 100 },
      excursions: { orderBy: { startedAt: "desc" }, take: 10, include: { incident: { select: { id: true, code: true, status: true } } } },
      simulations: { where: { status: "RUNNING" }, take: 1 },
    },
  });
  if (!sensor) throw AppError.notFound("Device not found");
  const { apiKeyHash: _h, ...safe } = sensor;
  return safe;
}

async function assign(
  tx: Prisma.TransactionClient,
  orgId: string,
  sensorId: string,
  target: { storageUnitId?: string | null; shipmentId?: string | null }
) {
  const lockedSensor = await tx.$queryRawUnsafe<Array<{ id: string }>>(
    "SELECT id FROM sensors WHERE id = ? AND orgId = ? FOR UPDATE",
    sensorId,
    orgId
  );
  if (lockedSensor.length === 0) throw AppError.notFound("Device not found");

  if (target.storageUnitId) {
    const unit = await tx.storageUnit.findFirst({ where: { id: target.storageUnitId, orgId } });
    if (!unit) throw AppError.badRequest("Storage unit not found in this organization");
  }
  if (target.shipmentId) {
    const shipment = await tx.shipment.findFirst({ where: { id: target.shipmentId, orgId } });
    if (!shipment) throw AppError.badRequest("Shipment not found in this organization");
  }
  await tx.sensorAssignment.updateMany({
    where: { sensorId, endedAt: null },
    data: { endedAt: new Date() },
  });
  if (target.storageUnitId || target.shipmentId) {
    await tx.sensorAssignment.create({
      data: {
        sensorId,
        storageUnitId: target.storageUnitId ?? null,
        shipmentId: target.shipmentId ?? null,
      },
    });
  }
}

export async function createDevice(orgId: string, actorId: string, input: DeviceInput, requestId?: string) {
  const credential = issueDeviceKey();
  return prisma.$transaction(async (tx) => {
    const sensor = await tx.sensor.create({
      data: {
        orgId,
        deviceId: input.deviceId.toUpperCase(),
        name: input.name,
        model: input.model ?? null,
        firmwareVersion: input.firmwareVersion ?? null,
        sensorType: input.sensorType,
        apiKeyHash: credential.hash,
        apiKeyPrefix: credential.prefix,
        calibrationDueAt: input.calibrationDueAt ?? null,
        status: "OFFLINE",
      },
    });
    await assign(tx, orgId, sensor.id, {
      storageUnitId: input.storageUnitId ?? null,
      shipmentId: input.shipmentId ?? null,
    });
    await writeAudit(tx, {
      orgId,
      actorId,
      action: "device.registered",
      entityType: "sensor",
      entityId: sensor.id,
      metadata: { deviceId: sensor.deviceId },
      requestId,
    });
    return { sensor, apiKey: credential.key };
  });
}

export async function updateDevice(
  orgId: string,
  actorId: string,
  id: string,
  input: Partial<DeviceInput> & { status?: string },
  requestId?: string
) {
  const existing = await prisma.sensor.findFirst({ where: { id, orgId } });
  if (!existing) throw AppError.notFound("Device not found");

  return prisma.$transaction(async (tx) => {
    if (input.storageUnitId !== undefined || input.shipmentId !== undefined) {
      await assign(tx, orgId, id, {
        storageUnitId: input.storageUnitId ?? null,
        shipmentId: input.shipmentId ?? null,
      });
    }
    const sensor = await tx.sensor.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.model !== undefined ? { model: input.model } : {}),
        ...(input.firmwareVersion !== undefined ? { firmwareVersion: input.firmwareVersion } : {}),
        ...(input.calibrationDueAt !== undefined ? { calibrationDueAt: input.calibrationDueAt } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });
    await writeAudit(tx, {
      orgId,
      actorId,
      action: "device.updated",
      entityType: "sensor",
      entityId: id,
      metadata: { fields: Object.keys(input) },
      requestId,
    });
    const { apiKeyHash: _h, ...safe } = sensor;
    return safe;
  });
}

export async function rotateDeviceKey(orgId: string, actorId: string, id: string, requestId?: string) {
  const existing = await prisma.sensor.findFirst({ where: { id, orgId } });
  if (!existing) throw AppError.notFound("Device not found");
  const credential = issueDeviceKey();
  return prisma.$transaction(async (tx) => {
    await tx.sensor.update({
      where: { id },
      data: { apiKeyHash: credential.hash, apiKeyPrefix: credential.prefix },
    });
    await writeAudit(tx, {
      orgId,
      actorId,
      action: "device.key_rotated",
      entityType: "sensor",
      entityId: id,
      requestId,
    });
    return { apiKey: credential.key, prefix: credential.prefix };
  });
}

export async function revokeDevice(orgId: string, actorId: string, id: string, requestId?: string) {
  const existing = await prisma.sensor.findFirst({ where: { id, orgId } });
  if (!existing) throw AppError.notFound("Device not found");
  return prisma.$transaction(async (tx) => {
    await tx.sensorAssignment.updateMany({ where: { sensorId: id, endedAt: null }, data: { endedAt: new Date() } });
    const sensor = await tx.sensor.update({ where: { id }, data: { status: "REVOKED" } });
    await writeAudit(tx, {
      orgId,
      actorId,
      action: "device.revoked",
      entityType: "sensor",
      entityId: id,
      requestId,
    });
    const { apiKeyHash: _h, ...safe } = sensor;
    return safe;
  });
}

export async function getDeviceStats(orgId: string) {
  const [online, offline, maintenance, revoked, calibrationDue] = await prisma.$transaction([
    prisma.sensor.count({ where: { orgId, status: "ONLINE" } }),
    prisma.sensor.count({ where: { orgId, status: "OFFLINE" } }),
    prisma.sensor.count({ where: { orgId, status: "MAINTENANCE" } }),
    prisma.sensor.count({ where: { orgId, status: "REVOKED" } }),
    prisma.sensor.count({ where: { orgId, calibrationDueAt: { lte: new Date() } } }),
  ]);
  return { online, offline, maintenance, revoked, calibrationDue };
}
