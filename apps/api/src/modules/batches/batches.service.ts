import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { writeAudit } from "../../services/audit";
import type { BatchInput } from "@frostguard/shared";

type ListArgs = {
  orgId: string;
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  productId?: string;
  storageUnitId?: string;
  expiringDays?: number;
};

export async function listBatches(args: ListArgs) {
  const where: Prisma.BatchWhereInput = {
    orgId: args.orgId,
    ...(args.status ? { status: args.status } : {}),
    ...(args.productId ? { productId: args.productId } : {}),
    ...(args.storageUnitId ? { storageUnitId: args.storageUnitId } : {}),
    ...(args.expiringDays
      ? { expiresAt: { lte: new Date(Date.now() + args.expiringDays * 86_400_000) } }
      : {}),
    ...(args.search
      ? {
          OR: [
            { batchNumber: { contains: args.search } },
            { product: { name: { contains: args.search } } },
            { product: { code: { contains: args.search } } },
          ],
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.batch.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, code: true, category: true, minTemp: true, maxTemp: true } },
        supplier: { select: { id: true, name: true } },
        storageUnit: { select: { id: true, code: true, name: true, warehouse: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip: (args.page - 1) * args.pageSize,
      take: args.pageSize,
    }),
    prisma.batch.count({ where }),
  ]);
  return { items, total };
}

export async function getBatch(orgId: string, id: string) {
  const batch = await prisma.batch.findFirst({
    where: { id, orgId },
    include: {
      product: true,
      supplier: true,
      storageUnit: { include: { warehouse: true } },
      temperatureProfile: true,
      shipmentItems: {
        include: {
          shipment: {
            select: {
              id: true,
              code: true,
              status: true,
              destinationName: true,
              dispatchedAt: true,
              deliveredAt: true,
            },
          },
        },
      },
    },
  });
  if (!batch) throw AppError.notFound("Batch not found");
  return batch;
}

export async function createBatch(orgId: string, actorId: string, input: BatchInput, requestId?: string) {
  const product = await prisma.product.findFirst({
    where: { id: input.productId, orgId },
    select: { id: true, temperatureProfileId: true, isActive: true, name: true },
  });
  if (!product) throw AppError.badRequest("Product not found in this organization");
  if (!product.isActive) throw AppError.badRequest("Cannot create a batch for an inactive product");

  if (input.supplierId) {
    const supplier = await prisma.supplier.findFirst({ where: { id: input.supplierId, orgId } });
    if (!supplier) throw AppError.badRequest("Supplier not found in this organization");
  }
  if (input.storageUnitId) {
    const unit = await prisma.storageUnit.findFirst({ where: { id: input.storageUnitId, orgId } });
    if (!unit) throw AppError.badRequest("Storage unit not found in this organization");
  }

  const profileId = input.temperatureProfileId ?? product.temperatureProfileId ?? null;

  return prisma.$transaction(async (tx) => {
    const batch = await tx.batch.create({
      data: {
        orgId,
        productId: product.id,
        supplierId: input.supplierId ?? null,
        batchNumber: input.batchNumber,
        manufacturedAt: input.manufacturedAt,
        expiresAt: input.expiresAt,
        quantity: input.quantity,
        remainingQuantity: input.quantity,
        storageUnitId: input.storageUnitId ?? null,
        temperatureProfileId: profileId,
        status: input.status,
      },
      include: { product: { select: { name: true, code: true } } },
    });
    await writeAudit(tx, {
      orgId,
      actorId,
      action: "batch.created",
      entityType: "batch",
      entityId: batch.id,
      metadata: { batchNumber: batch.batchNumber, quantity: batch.quantity },
      requestId,
    });
    await tx.outboxEvent.create({
      data: { orgId, topic: "batch:created", payload: { batchId: batch.id } },
    });
    return batch;
  });
}

export async function updateBatch(
  orgId: string,
  actorId: string,
  id: string,
  input: Partial<BatchInput>,
  requestId?: string
) {
  const batch = await prisma.batch.findFirst({ where: { id, orgId } });
  if (!batch) throw AppError.notFound("Batch not found");

  if (input.storageUnitId) {
    const unit = await prisma.storageUnit.findFirst({ where: { id: input.storageUnitId, orgId } });
    if (!unit) throw AppError.badRequest("Storage unit not found in this organization");
    if (unit.status !== "OPERATIONAL") throw AppError.badRequest("Target storage unit is not operational");
  }
  if (input.quantity !== undefined && input.quantity < batch.remainingQuantity) {
    throw AppError.badRequest("Quantity cannot be lower than the remaining reserved stock");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.batch.update({
      where: { id },
      data: {
        ...(input.storageUnitId !== undefined ? { storageUnitId: input.storageUnitId } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
        ...(input.quantity !== undefined
          ? {
              quantity: input.quantity,
              remainingQuantity: input.quantity - (batch.quantity - batch.remainingQuantity),
            }
          : {}),
        ...(input.temperatureProfileId !== undefined
          ? { temperatureProfileId: input.temperatureProfileId }
          : {}),
      },
    });
    await writeAudit(tx, {
      orgId,
      actorId,
      action: "batch.updated",
      entityType: "batch",
      entityId: id,
      metadata: { fields: Object.keys(input) },
      requestId,
    });
    return updated;
  });
}

/** Full batch genealogy: registration, storage, shipments, temperature events. */
export async function getBatchTraceability(orgId: string, id: string) {
  const batch = await getBatch(orgId, id);

  const shipmentIds = batch.shipmentItems.map((i) => i.shipment.id);
  const [shipmentEvents, excursions, readings] = await Promise.all([
    shipmentIds.length
      ? prisma.shipmentEvent.findMany({
          where: { shipmentId: { in: shipmentIds } },
          orderBy: { occurredAt: "asc" },
        })
      : Promise.resolve([]),
    prisma.excursion.findMany({
      where: {
        orgId,
        OR: [{ batchId: id }, ...(shipmentIds.length ? [{ shipmentId: { in: shipmentIds } }] : [])],
      },
      orderBy: { startedAt: "asc" },
      include: { incident: { select: { id: true, code: true, status: true } } },
    }),
    prisma.sensorReading.findMany({
      where: {
        orgId,
        OR: [
          ...(batch.storageUnitId ? [{ sensor: { assignments: { some: { storageUnitId: batch.storageUnitId } } } }] : []),
          ...(shipmentIds.length ? [{ sensor: { assignments: { some: { shipmentId: { in: shipmentIds } } } } }] : []),
        ],
      },
      orderBy: { recordedAt: "asc" },
      take: 500,
      select: { temperature: true, recordedAt: true, isSimulated: true, sensorId: true },
    }),
  ]);

  const timeline = [
    {
      at: batch.createdAt,
      type: "BATCH_REGISTERED",
      title: `Batch ${batch.batchNumber} registered`,
      detail: `${batch.quantity} units of ${batch.product.name}`,
    },
    ...(batch.storageUnit
      ? [
          {
            at: batch.createdAt,
            type: "STORED",
            title: `Stored in ${batch.storageUnit.name}`,
            detail: `${batch.storageUnit.warehouse.name} · ${batch.storageUnit.code}`,
          },
        ]
      : []),
    ...batch.shipmentItems.flatMap((item) => [
      {
        at: item.shipment.dispatchedAt ?? item.shipment.deliveredAt ?? batch.createdAt,
        type: "SHIPMENT",
        title: `Shipment ${item.shipment.code} · ${item.shipment.status}`,
        detail: `${item.quantity} units to ${item.shipment.destinationName}`,
      },
    ]),
    ...shipmentEvents.map((e) => ({
      at: e.occurredAt,
      type: `SHIPMENT_${e.type}`,
      title: e.message,
      detail: `Shipment event`,
    })),
    ...excursions.map((e) => ({
      at: e.startedAt,
      type: "EXCURSION",
      title: `${e.severity} excursion · ${e.minTemp}–${e.maxTemp} °C`,
      detail: e.incident ? `Incident ${e.incident.code} (${e.incident.status})` : "No incident linked",
    })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return {
    batch,
    timeline,
    excursions,
    readings,
    shipmentIds,
  };
}
