import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { writeAudit } from "../../services/audit";

export async function listAlerts(params: {
  orgId: string;
  page: number;
  pageSize: number;
  status?: string;
  severity?: string;
  search?: string;
}) {
  const where: Prisma.AlertWhereInput = {
    orgId: params.orgId,
    ...(params.status ? { status: params.status } : {}),
    ...(params.severity ? { severity: params.severity } : {}),
    ...(params.search
      ? { OR: [{ title: { contains: params.search } }, { message: { contains: params.search } }] }
      : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.alert.findMany({
      where,
      include: {
        excursion: {
          include: {
            sensor: { select: { id: true, deviceId: true, name: true } },
            storageUnit: { select: { id: true, name: true, code: true } },
            shipment: { select: { id: true, code: true } },
          },
        },
        incident: { select: { id: true, code: true, status: true } },
        acknowledgedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.alert.count({ where }),
  ]);
  return { items, total };
}

export async function acknowledgeAlert(orgId: string, actorId: string, id: string, requestId?: string) {
  return prisma.$transaction(async (tx) => {
    const alert = await tx.alert.findFirst({ where: { id, orgId } });
    if (!alert) throw AppError.notFound("Alert not found");
    if (alert.status !== "OPEN") throw AppError.conflict(`Alert is already ${alert.status.toLowerCase()}`);

    const updated = await tx.alert.update({
      where: { id },
      data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date(), acknowledgedById: actorId },
    });
    await writeAudit(tx, {
      orgId,
      actorId,
      action: "alert.acknowledged",
      entityType: "alert",
      entityId: id,
      requestId,
    });
    await tx.outboxEvent.create({
      data: { orgId, topic: "alert:updated", payload: { alertId: id, status: "ACKNOWLEDGED" } },
    });
    return updated;
  });
}
