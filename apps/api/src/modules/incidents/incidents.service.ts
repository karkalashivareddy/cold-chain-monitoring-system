import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { writeAudit } from "../../services/audit";

const TRANSITIONS: Record<string, string[]> = {
  OPEN: ["ACKNOWLEDGED"],
  ACKNOWLEDGED: ["INVESTIGATING", "RESOLVED"],
  INVESTIGATING: ["RESOLVED"],
  RESOLVED: ["CLOSED"],
  CLOSED: [],
};

export async function listIncidents(params: {
  orgId: string;
  page: number;
  pageSize: number;
  status?: string;
  severity?: string;
  assigneeId?: string;
  search?: string;
}) {
  const where: Prisma.IncidentWhereInput = {
    orgId: params.orgId,
    ...(params.status ? { status: params.status } : {}),
    ...(params.severity ? { severity: params.severity } : {}),
    ...(params.assigneeId ? { assigneeId: params.assigneeId } : {}),
    ...(params.search
      ? { OR: [{ code: { contains: params.search } }, { title: { contains: params.search } }] }
      : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.incident.findMany({
      where,
      include: {
        assignee: { select: { id: true, fullName: true } },
        alert: { select: { id: true, severity: true, status: true } },
        excursion: {
          select: {
            id: true,
            startedAt: true,
            minTemp: true,
            maxTemp: true,
            status: true,
            sensor: { select: { name: true, deviceId: true } },
          },
        },
        _count: { select: { actions: true } },
      },
      orderBy: [{ status: "asc" }, { openedAt: "desc" }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.incident.count({ where }),
  ]);
  return { items, total };
}

export async function getIncident(orgId: string, id: string) {
  const incident = await prisma.incident.findFirst({
    where: { id, orgId },
    include: {
      assignee: { select: { id: true, fullName: true, email: true } },
      createdBy: { select: { id: true, fullName: true } },
      alert: true,
      excursion: {
        include: {
          sensor: true,
          storageUnit: { include: { warehouse: true } },
          shipment: { select: { id: true, code: true, status: true, destinationName: true } },
        },
      },
      actions: {
        orderBy: { createdAt: "asc" },
        include: { actor: { select: { id: true, fullName: true } } },
      },
    },
  });
  if (!incident) throw AppError.notFound("Incident not found");
  return incident;
}

async function transition(
  orgId: string,
  actorId: string,
  id: string,
  to: string,
  requestId: string | undefined,
  extra: Prisma.IncidentUpdateInput = {},
  action?: { action: string; notes?: string }
) {
  return prisma.$transaction(async (tx) => {
    const incident = await tx.incident.findFirst({ where: { id, orgId } });
    if (!incident) throw AppError.notFound("Incident not found");
    const allowed = TRANSITIONS[incident.status] ?? [];
    if (!allowed.includes(to) && incident.status !== to) {
      throw AppError.conflict(`Invalid incident transition ${incident.status} → ${to}`);
    }
    const updated = await tx.incident.update({
      where: { id },
      data: { status: to, ...extra },
    });
    if (action) {
      await tx.incidentAction.create({
        data: { incidentId: id, actorId, action: action.action, notes: action.notes ?? null },
      });
    }
    await writeAudit(tx, {
      orgId,
      actorId,
      action: `incident.${to.toLowerCase()}`,
      entityType: "incident",
      entityId: id,
      metadata: { from: incident.status, to },
      requestId,
    });
    await tx.outboxEvent.create({
      data: { orgId, topic: "incident:updated", payload: { incidentId: id, status: to } },
    });
    return updated;
  });
}

export async function acknowledgeIncident(orgId: string, actorId: string, id: string, notes: string | undefined, requestId?: string) {
  return transition(orgId, actorId, id, "ACKNOWLEDGED", requestId, { acknowledgedAt: new Date() }, {
    action: "ACKNOWLEDGED",
    notes,
  });
}

export async function assignIncident(orgId: string, actorId: string, id: string, assigneeId: string, requestId?: string) {
  const member = await prisma.membership.findUnique({ where: { orgId_userId: { orgId, userId: assigneeId } } });
  if (!member) throw AppError.badRequest("Assignee is not a member of this organization");

  return prisma.$transaction(async (tx) => {
    const incident = await tx.incident.findFirst({ where: { id, orgId } });
    if (!incident) throw AppError.notFound("Incident not found");
    if (["RESOLVED", "CLOSED"].includes(incident.status)) {
      throw AppError.conflict("Cannot assign a resolved incident");
    }
    const updated = await tx.incident.update({ where: { id }, data: { assigneeId } });
    await tx.incidentAction.create({
      data: { incidentId: id, actorId, action: "ASSIGNED", notes: `Assigned to ${assigneeId}` },
    });
    await tx.notificationLog.create({
      data: {
        orgId,
        userId: assigneeId,
        channel: "IN_APP",
        subject: `Incident ${incident.code} assigned to you`,
        body: incident.title,
        status: "SENT",
        sentAt: new Date(),
      },
    });
    await writeAudit(tx, {
      orgId,
      actorId,
      action: "incident.assigned",
      entityType: "incident",
      entityId: id,
      metadata: { assigneeId },
      requestId,
    });
    await tx.outboxEvent.create({
      data: { orgId, topic: "incident:updated", payload: { incidentId: id, assigneeId } },
    });
    return updated;
  });
}

export async function startInvestigation(orgId: string, actorId: string, id: string, notes: string | undefined, requestId?: string) {
  return transition(orgId, actorId, id, "INVESTIGATING", requestId, {}, { action: "INVESTIGATION_STARTED", notes });
}

export async function resolveIncident(
  orgId: string,
  actorId: string,
  id: string,
  input: { resolutionNotes: string; outcome: string; rootCause?: string | null },
  requestId?: string
) {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      "SELECT id FROM incidents WHERE id = ? AND orgId = ? FOR UPDATE",
      id,
      orgId
    );
    if (locked.length === 0) throw AppError.notFound("Incident not found");

    const incident = await tx.incident.findFirst({ where: { id, orgId } });
    if (!incident) throw AppError.notFound("Incident not found");
    if (!["ACKNOWLEDGED", "INVESTIGATING"].includes(incident.status)) {
      throw AppError.conflict(`Incident must be acknowledged before resolution (current: ${incident.status})`);
    }
    const now = new Date();
    const updated = await tx.incident.update({
      where: { id },
      data: {
        status: "RESOLVED",
        resolvedAt: now,
        resolutionNotes: input.resolutionNotes,
        outcome: input.outcome,
        rootCause: input.rootCause ?? null,
      },
    });
    await tx.incidentAction.create({
      data: {
        incidentId: id,
        actorId,
        action: "RESOLVED",
        notes: `${input.outcome}: ${input.resolutionNotes}`,
      },
    });
    if (incident.alertId) {
      await tx.alert.update({
        where: { id: incident.alertId },
        data: { status: "RESOLVED", resolvedAt: now },
      });
    }
    if (incident.excursionId) {
      await tx.excursion.update({
        where: { id: incident.excursionId },
        data: { status: "CLOSED", endedAt: (await tx.excursion.findUnique({ where: { id: incident.excursionId } }))?.endedAt ?? now },
      });
    }
    await tx.notificationLog.create({
      data: {
        orgId,
        userId: incident.assigneeId,
        channel: "IN_APP",
        subject: `Incident ${incident.code} resolved`,
        body: input.resolutionNotes,
        status: "SENT",
        sentAt: now,
      },
    });
    await writeAudit(tx, {
      orgId,
      actorId,
      action: "incident.resolved",
      entityType: "incident",
      entityId: id,
      metadata: { outcome: input.outcome },
      requestId,
    });
    await tx.outboxEvent.create({
      data: { orgId, topic: "incident:updated", payload: { incidentId: id, status: "RESOLVED" } },
    });
    return updated;
  });
}

export async function addIncidentNote(orgId: string, actorId: string, id: string, notes: string, requestId?: string) {
  const incident = await prisma.incident.findFirst({ where: { id, orgId } });
  if (!incident) throw AppError.notFound("Incident not found");
  return prisma.$transaction(async (tx) => {
    const action = await tx.incidentAction.create({
      data: { incidentId: id, actorId, action: "NOTE", notes },
    });
    await writeAudit(tx, {
      orgId,
      actorId,
      action: "incident.note_added",
      entityType: "incident",
      entityId: id,
      requestId,
    });
    return action;
  });
}

export async function getIncidentStats(orgId: string) {
  const [open, acknowledged, investigating, resolved, criticalOpen] = await prisma.$transaction([
    prisma.incident.count({ where: { orgId, status: "OPEN" } }),
    prisma.incident.count({ where: { orgId, status: "ACKNOWLEDGED" } }),
    prisma.incident.count({ where: { orgId, status: "INVESTIGATING" } }),
    prisma.incident.count({ where: { orgId, status: "RESOLVED" } }),
    prisma.incident.count({ where: { orgId, status: { in: ["OPEN", "ACKNOWLEDGED", "INVESTIGATING"] }, severity: "CRITICAL" } }),
  ]);
  return { open, acknowledged, investigating, resolved, criticalOpen };
}
