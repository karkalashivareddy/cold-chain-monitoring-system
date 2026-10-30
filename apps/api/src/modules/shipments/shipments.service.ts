import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { writeAudit } from "../../services/audit";
import type { ShipmentInput } from "@frostguard/shared";

export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const retryable =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        (err.code === "P2034" || err.code === "P2028");
      if (!retryable || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 40 * (i + 1) + Math.random() * 40));
    }
  }
  throw lastError;
}

function shipmentCode() {
  return `SHP-${new Date().getFullYear()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

type ListArgs = {
  orgId: string;
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
};

export async function listShipments(args: ListArgs) {
  const where: Prisma.ShipmentWhereInput = {
    orgId: args.orgId,
    ...(args.status ? { status: args.status } : {}),
    ...(args.search
      ? {
          OR: [
            { code: { contains: args.search } },
            { destinationName: { contains: args.search } },
            { destinationCity: { contains: args.search } },
          ],
        }
      : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.shipment.findMany({
      where,
      include: {
        originWarehouse: { select: { id: true, name: true, city: true } },
        vehicle: { select: { id: true, plateNumber: true, model: true } },
        driver: { select: { id: true, fullName: true } },
        _count: { select: { items: true } },
        excursions: { where: { status: "OPEN" }, select: { id: true, severity: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (args.page - 1) * args.pageSize,
      take: args.pageSize,
    }),
    prisma.shipment.count({ where }),
  ]);
  return { items, total };
}

export async function getShipment(orgId: string, id: string) {
  const shipment = await prisma.shipment.findFirst({
    where: { id, orgId },
    include: {
      originWarehouse: true,
      vehicle: true,
      driver: true,
      items: {
        include: {
          batch: {
            include: {
              product: { select: { id: true, name: true, code: true, category: true, minTemp: true, maxTemp: true } },
              temperatureProfile: true,
            },
          },
        },
      },
      events: { orderBy: { occurredAt: "desc" }, include: { createdBy: { select: { fullName: true } } } },
      sensorAssignments: {
        where: { endedAt: null },
        include: { sensor: { include: { readings: { orderBy: { recordedAt: "desc" }, take: 1 } } } },
      },
      excursions: {
        orderBy: { startedAt: "desc" },
        take: 20,
        include: { incident: { select: { id: true, code: true, status: true, severity: true } } },
      },
    },
  });
  if (!shipment) throw AppError.notFound("Shipment not found");
  return shipment;
}

export async function createShipment(orgId: string, actorId: string, input: ShipmentInput, requestId?: string) {
  const warehouse = await prisma.warehouse.findFirst({ where: { id: input.originWarehouseId, orgId } });
  if (!warehouse) throw AppError.badRequest("Origin warehouse not found in this organization");
  if (warehouse.latitude == null || warehouse.longitude == null) {
    throw AppError.badRequest("Origin warehouse must have coordinates before dispatching shipments");
  }
  if (input.vehicleId) {
    const vehicle = await prisma.vehicle.findFirst({ where: { id: input.vehicleId, orgId, isActive: true } });
    if (!vehicle) throw AppError.badRequest("Vehicle not found or inactive");
  }
  if (input.driverId) {
    const driver = await prisma.driver.findFirst({ where: { id: input.driverId, orgId, isActive: true } });
    if (!driver) throw AppError.badRequest("Driver not found or inactive");
  }

  const batchIds = input.items.map((i) => i.batchId);
  const batches = await prisma.batch.findMany({ where: { id: { in: batchIds }, orgId } });
  if (batches.length !== new Set(batchIds).size) throw AppError.badRequest("One or more batches were not found in this organization");

  const now = new Date();
  for (const item of input.items) {
    const batch = batches.find((b) => b.id === item.batchId)!;
    if (batch.remainingQuantity < item.quantity) {
      throw AppError.conflict(`Insufficient available stock for batch ${batch.batchNumber}`, {
        available: batch.remainingQuantity,
        requested: item.quantity,
      });
    }
    if (!["AVAILABLE", "RESERVED"].includes(batch.status)) {
      throw AppError.conflict(`Batch ${batch.batchNumber} is not available for shipment (status ${batch.status})`);
    }
    if (batch.expiresAt <= now) {
      throw AppError.conflict(`Batch ${batch.batchNumber} has expired and cannot be shipped`);
    }
  }

  return prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.create({
      data: {
        orgId,
        code: shipmentCode(),
        originWarehouseId: input.originWarehouseId,
        destinationName: input.destinationName,
        destinationCity: input.destinationCity ?? null,
        destinationLat: input.destinationLat,
        destinationLng: input.destinationLng,
        originLat: warehouse.latitude!,
        originLng: warehouse.longitude!,
        currentLat: warehouse.latitude,
        currentLng: warehouse.longitude,
        vehicleId: input.vehicleId ?? null,
        driverId: input.driverId ?? null,
        status: "PLANNED",
        plannedDepartureAt: input.plannedDepartureAt ?? null,
        estimatedArrivalAt: input.estimatedArrivalAt ?? null,
        notes: input.notes ?? null,
        items: {
          create: input.items.map((i) => ({ batchId: i.batchId, quantity: i.quantity })),
        },
        events: {
          create: {
            type: "NOTE",
            message: "Shipment created and planned",
            createdById: actorId,
          },
        },
      },
      include: { items: true },
    });

    await writeAudit(tx, {
      orgId,
      actorId,
      action: "shipment.created",
      entityType: "shipment",
      entityId: shipment.id,
      metadata: { code: shipment.code, items: input.items.length },
      requestId,
    });
    await tx.outboxEvent.create({
      data: { orgId, topic: "shipment:updated", payload: { shipmentId: shipment.id, status: shipment.status } },
    });
    return shipment;
  });
}

export async function dispatchShipment(orgId: string, actorId: string, id: string, requestId?: string) {
  return withRetry(() =>
    prisma.$transaction(
      async (tx) => {
        // Row-level lock prevents two operators dispatching the same shipment.
        const locked = await tx.$queryRaw<Array<{ status: string }>>`
          SELECT status FROM shipments WHERE id = ${id} AND orgId = ${orgId} FOR UPDATE
        `;
        if (locked.length === 0) throw AppError.notFound("Shipment not found");
        const status = locked[0]!.status;
        if (!["DRAFT", "PLANNED"].includes(status)) {
          throw AppError.conflict(`Shipment cannot be dispatched from status ${status}`);
        }

        const shipment = await tx.shipment.findUnique({
          where: { id },
          include: { items: { include: { batch: true } } },
        });
        if (!shipment) throw AppError.notFound("Shipment not found");
        if (shipment.items.length === 0) throw AppError.badRequest("Shipment has no items");

        for (const item of shipment.items) {
          if (item.batch.orgId !== orgId) throw AppError.forbidden("Cross-organization batch reference rejected");
          if (item.batch.remainingQuantity < item.quantity) {
            throw AppError.conflict(`Insufficient stock for batch ${item.batch.batchNumber}`, {
              available: item.batch.remainingQuantity,
              requested: item.quantity,
            });
          }
          // Stored procedure: SELECT ... FOR UPDATE + conditional decrement + SIGNAL.
          await tx.$queryRaw`CALL sp_reserve_batch_stock(${item.batchId}, ${item.quantity})`;
        }

        const now = new Date();
        const updated = await tx.shipment.update({
          where: { id },
          data: {
            status: "DISPATCHED",
            dispatchedAt: now,
            currentLat: shipment.originLat,
            currentLng: shipment.originLng,
            progressPercent: 0,
            events: {
              create: {
                type: "DEPARTED",
                message: `Shipment dispatched from ${shipment.destinationName ? "origin warehouse" : "origin"}`,
                lat: shipment.originLat,
                lng: shipment.originLng,
                createdById: actorId,
              },
            },
          },
        });

        await writeAudit(tx, {
          orgId,
          actorId,
          action: "shipment.dispatched",
          entityType: "shipment",
          entityId: id,
          metadata: { code: shipment.code, items: shipment.items.length },
          requestId,
        });
        await tx.outboxEvent.create({
          data: { orgId, topic: "shipment:updated", payload: { shipmentId: id, status: "DISPATCHED" } },
        });
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 }
    )
  );
}

export async function deliverShipment(
  orgId: string,
  actorId: string,
  id: string,
  input: { receivedBy: string; notes?: string | null },
  requestId?: string
) {
  return prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.findFirst({ where: { id, orgId } });
    if (!shipment) throw AppError.notFound("Shipment not found");
    if (!["DISPATCHED", "IN_TRANSIT", "DELAYED"].includes(shipment.status)) {
      throw AppError.conflict(`Shipment cannot be delivered from status ${shipment.status}`);
    }
    const now = new Date();
    const updated = await tx.shipment.update({
      where: { id },
      data: {
        status: "DELIVERED",
        deliveredAt: now,
        progressPercent: 100,
        currentLat: shipment.destinationLat,
        currentLng: shipment.destinationLng,
        events: {
          create: {
            type: "DELIVERED",
            message: `Delivered to ${input.receivedBy}${input.notes ? ` — ${input.notes}` : ""}`,
            lat: shipment.destinationLat,
            lng: shipment.destinationLng,
            createdById: actorId,
          },
        },
      },
    });
    await writeAudit(tx, {
      orgId,
      actorId,
      action: "shipment.delivered",
      entityType: "shipment",
      entityId: id,
      metadata: { receivedBy: input.receivedBy },
      requestId,
    });
    await tx.outboxEvent.create({
      data: { orgId, topic: "shipment:updated", payload: { shipmentId: id, status: "DELIVERED" } },
    });
    return updated;
  });
}

export async function updatePosition(
  orgId: string,
  actorId: string,
  id: string,
  input: { lat: number; lng: number; progressPercent?: number; status?: string; message?: string },
  requestId?: string
) {
  const shipment = await prisma.shipment.findFirst({ where: { id, orgId } });
  if (!shipment) throw AppError.notFound("Shipment not found");
  if (["DELIVERED", "CANCELLED"].includes(shipment.status)) {
    throw AppError.conflict("Cannot update position of a completed shipment");
  }
  const progress =
    input.progressPercent !== undefined
      ? Math.max(0, Math.min(100, Math.round(input.progressPercent)))
      : shipment.progressPercent;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.shipment.update({
      where: { id },
      data: {
        currentLat: input.lat,
        currentLng: input.lng,
        progressPercent: progress,
        status: input.status ?? (shipment.status === "DISPATCHED" ? "IN_TRANSIT" : shipment.status),
        events: {
          create: {
            type: "CHECKPOINT",
            message: input.message ?? `Position updated (${progress}% complete)`,
            lat: input.lat,
            lng: input.lng,
            createdById: actorId,
          },
        },
      },
    });
    await writeAudit(tx, {
      orgId,
      actorId,
      action: "shipment.position_updated",
      entityType: "shipment",
      entityId: id,
      metadata: { lat: input.lat, lng: input.lng, progress },
      requestId,
    });
    await tx.outboxEvent.create({
      data: { orgId, topic: "shipment:updated", payload: { shipmentId: id, lat: input.lat, lng: input.lng, progress } },
    });
    return updated;
  });
}

export async function cancelShipment(orgId: string, actorId: string, id: string, requestId?: string) {
  return prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.findFirst({ where: { id, orgId } });
    if (!shipment) throw AppError.notFound("Shipment not found");
    if (!["DRAFT", "PLANNED"].includes(shipment.status)) {
      throw AppError.conflict("Only draft or planned shipments can be cancelled");
    }
    const updated = await tx.shipment.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
    await writeAudit(tx, {
      orgId,
      actorId,
      action: "shipment.cancelled",
      entityType: "shipment",
      entityId: id,
      requestId,
    });
    await tx.outboxEvent.create({
      data: { orgId, topic: "shipment:updated", payload: { shipmentId: id, status: "CANCELLED" } },
    });
    return updated;
  });
}

export async function getShipmentMap(orgId: string) {
  const shipments = await prisma.shipment.findMany({
    where: { orgId, status: { notIn: ["CANCELLED"] } },
    include: {
      excursions: { where: { status: "OPEN" }, select: { id: true, severity: true, type: true } },
      sensorAssignments: {
        where: { endedAt: null },
        include: { sensor: { include: { readings: { orderBy: { recordedAt: "desc" }, take: 1 } } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return shipments.map((s) => ({
    id: s.id,
    code: s.code,
    status: s.status,
    origin: { lat: Number(s.originLat), lng: Number(s.originLng) },
    destination: { lat: Number(s.destinationLat), lng: Number(s.destinationLng) },
    current: s.currentLat != null && s.currentLng != null
      ? { lat: Number(s.currentLat), lng: Number(s.currentLng) }
      : null,
    progressPercent: s.progressPercent,
    riskScore: s.riskScore,
    destinationName: s.destinationName,
    temperature: s.sensorAssignments[0]?.sensor.readings[0]
      ? Number(s.sensorAssignments[0].sensor.readings[0].temperature)
      : null,
    isSimulated: s.sensorAssignments[0]?.sensor.readings[0]?.isSimulated ?? false,
    openExcursions: s.excursions,
    vehicleId: s.vehicleId,
  }));
}
