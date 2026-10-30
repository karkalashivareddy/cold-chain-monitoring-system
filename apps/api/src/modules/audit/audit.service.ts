import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";

export async function listAuditLogs(params: {
  orgId: string;
  page: number;
  pageSize: number;
  entityType?: string;
  action?: string;
  actorId?: string;
  from?: Date;
  to?: Date;
}) {
  const where: Prisma.AuditLogWhereInput = {
    orgId: params.orgId,
    ...(params.entityType ? { entityType: params.entityType } : {}),
    ...(params.action ? { action: { contains: params.action } } : {}),
    ...(params.actorId ? { actorId: params.actorId } : {}),
    ...(params.from || params.to
      ? { createdAt: { ...(params.from ? { gte: params.from } : {}), ...(params.to ? { lte: params.to } : {}) } }
      : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      include: { actor: { select: { id: true, fullName: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, total };
}
