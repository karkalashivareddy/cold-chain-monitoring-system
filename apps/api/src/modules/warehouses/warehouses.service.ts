import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { writeAudit } from "../../services/audit";
import type { WarehouseInput } from "@frostguard/shared";

export async function listWarehouses(orgId: string, search?: string) {
  const where: Prisma.WarehouseWhereInput = {
    orgId,
    ...(search ? { OR: [{ name: { contains: search } }, { code: { contains: search } }, { city: { contains: search } }] } : {}),
  };
  return prisma.warehouse.findMany({
    where,
    include: {
      _count: { select: { storageUnits: true, shipmentsAsOrigin: true } },
      storageUnits: {
        select: { id: true, code: true, name: true, type: true, status: true, minTemp: true, maxTemp: true },
      },
    },
    orderBy: { name: "asc" },
  });
}

export async function getWarehouse(orgId: string, id: string) {
  const warehouse = await prisma.warehouse.findFirst({
    where: { id, orgId },
    include: {
      storageUnits: {
        include: {
          _count: { select: { batches: true } },
          sensorAssignments: { where: { endedAt: null }, include: { sensor: { select: { deviceId: true, status: true } } } },
        },
      },
      shipmentsAsOrigin: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, code: true, status: true, destinationName: true, createdAt: true },
      },
    },
  });
  if (!warehouse) throw AppError.notFound("Warehouse not found");
  return warehouse;
}

export async function createWarehouse(orgId: string, actorId: string, input: WarehouseInput, requestId?: string) {
  return prisma.$transaction(async (tx) => {
    const warehouse = await tx.warehouse.create({
      data: {
        orgId,
        code: input.code.toUpperCase(),
        name: input.name,
        addressLine: input.addressLine ?? null,
        city: input.city ?? null,
        country: input.country ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        isActive: input.isActive,
      },
    });
    await writeAudit(tx, {
      orgId,
      actorId,
      action: "warehouse.created",
      entityType: "warehouse",
      entityId: warehouse.id,
      metadata: { code: warehouse.code },
      requestId,
    });
    return warehouse;
  });
}

export async function updateWarehouse(
  orgId: string,
  actorId: string,
  id: string,
  input: Partial<WarehouseInput>,
  requestId?: string
) {
  const existing = await prisma.warehouse.findFirst({ where: { id, orgId } });
  if (!existing) throw AppError.notFound("Warehouse not found");
  return prisma.$transaction(async (tx) => {
    const warehouse = await tx.warehouse.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.addressLine !== undefined ? { addressLine: input.addressLine } : {}),
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.country !== undefined ? { country: input.country } : {}),
        ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
        ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
    await writeAudit(tx, {
      orgId,
      actorId,
      action: "warehouse.updated",
      entityType: "warehouse",
      entityId: id,
      metadata: { fields: Object.keys(input) },
      requestId,
    });
    return warehouse;
  });
}
