import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { writeAudit } from "../../services/audit";
import type { StorageUnitInput } from "@frostguard/shared";

type ListArgs = {
  orgId: string;
  page: number;
  pageSize: number;
  search?: string;
  warehouseId?: string;
  status?: string;
  type?: string;
};

export async function listStorageUnits(args: ListArgs) {
  const where: Prisma.StorageUnitWhereInput = {
    orgId: args.orgId,
    ...(args.warehouseId ? { warehouseId: args.warehouseId } : {}),
    ...(args.status ? { status: args.status } : {}),
    ...(args.type ? { type: args.type } : {}),
    ...(args.search
      ? { OR: [{ name: { contains: args.search } }, { code: { contains: args.search } }] }
      : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.storageUnit.findMany({
      where,
      include: {
        warehouse: { select: { id: true, name: true, city: true } },
        _count: { select: { batches: true } },
        sensorAssignments: {
          where: { endedAt: null },
          include: { sensor: { select: { id: true, deviceId: true, status: true, lastSeenAt: true } } },
        },
      },
      orderBy: { name: "asc" },
      skip: (args.page - 1) * args.pageSize,
      take: args.pageSize,
    }),
    prisma.storageUnit.count({ where }),
  ]);
  return { items, total };
}

export async function getStorageUnit(orgId: string, id: string) {
  const unit = await prisma.storageUnit.findFirst({
    where: { id, orgId },
    include: {
      warehouse: true,
      batches: {
        orderBy: { expiresAt: "asc" },
        include: { product: { select: { name: true, code: true } } },
      },
      sensorAssignments: {
        where: { endedAt: null },
        include: { sensor: { include: { readings: { orderBy: { recordedAt: "desc" }, take: 1 } } } },
      },
      excursions: { orderBy: { startedAt: "desc" }, take: 10, include: { incident: { select: { code: true, status: true } } } },
      maintenanceLogs: { orderBy: { performedAt: "desc" }, take: 10 },
    },
  });
  if (!unit) throw AppError.notFound("Storage unit not found");
  return unit;
}

export async function createStorageUnit(orgId: string, actorId: string, input: StorageUnitInput, requestId?: string) {
  const warehouse = await prisma.warehouse.findFirst({ where: { id: input.warehouseId, orgId } });
  if (!warehouse) throw AppError.badRequest("Warehouse not found in this organization");

  return prisma.$transaction(async (tx) => {
    const unit = await tx.storageUnit.create({
      data: {
        orgId,
        warehouseId: input.warehouseId,
        code: input.code.toUpperCase(),
        name: input.name,
        type: input.type,
        capacityUnits: input.capacityUnits,
        minTemp: input.minTemp,
        maxTemp: input.maxTemp,
        status: input.status,
      },
    });
    await writeAudit(tx, {
      orgId,
      actorId,
      action: "storage_unit.created",
      entityType: "storage_unit",
      entityId: unit.id,
      metadata: { code: unit.code, warehouseId: input.warehouseId },
      requestId,
    });
    return unit;
  });
}

export async function updateStorageUnit(
  orgId: string,
  actorId: string,
  id: string,
  input: Partial<StorageUnitInput>,
  requestId?: string
) {
  const existing = await prisma.storageUnit.findFirst({ where: { id, orgId } });
  if (!existing) throw AppError.notFound("Storage unit not found");

  return prisma.$transaction(async (tx) => {
    const unit = await tx.storageUnit.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.capacityUnits !== undefined ? { capacityUnits: input.capacityUnits } : {}),
        ...(input.minTemp !== undefined ? { minTemp: input.minTemp } : {}),
        ...(input.maxTemp !== undefined ? { maxTemp: input.maxTemp } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });
    await writeAudit(tx, {
      orgId,
      actorId,
      action: "storage_unit.updated",
      entityType: "storage_unit",
      entityId: id,
      metadata: { fields: Object.keys(input) },
      requestId,
    });
    return unit;
  });
}

export async function addMaintenanceLog(
  orgId: string,
  actorId: string,
  storageUnitId: string,
  input: { type: string; performedBy: string; notes?: string | null; performedAt?: Date; sensorId?: string | null },
  requestId?: string
) {
  const unit = await prisma.storageUnit.findFirst({ where: { id: storageUnitId, orgId } });
  if (!unit) throw AppError.notFound("Storage unit not found");

  return prisma.$transaction(async (tx) => {
    const log = await tx.maintenanceLog.create({
      data: {
        orgId,
        storageUnitId,
        sensorId: input.sensorId ?? null,
        type: input.type,
        performedBy: input.performedBy,
        notes: input.notes ?? null,
        performedAt: input.performedAt ?? new Date(),
      },
    });
    await writeAudit(tx, {
      orgId,
      actorId,
      action: "maintenance.logged",
      entityType: "storage_unit",
      entityId: storageUnitId,
      metadata: { type: input.type },
      requestId,
    });
    return log;
  });
}
