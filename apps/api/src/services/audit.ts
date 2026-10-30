import type { Prisma } from "@prisma/client";

type AuditClient = {
  auditLog: {
    create: (args: Prisma.AuditLogCreateArgs) => Promise<unknown>;
  };
};

export type AuditInput = {
  orgId: string;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  requestId?: string | null;
};

/**
 * Audit rows are inserted inside the same transaction as the business change
 * so that a rolled-back operation never leaves an audit trail claiming success.
 */
export async function writeAudit(tx: AuditClient, input: AuditInput): Promise<void> {
  await tx.auditLog.create({
    data: {
      orgId: input.orgId,
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      ip: input.ip ?? null,
      requestId: input.requestId ?? null,
    },
  });
}

export function auditFromRequest(
  req: { auth?: { userId: string; orgId: string }; ip?: string },
  action: string,
  entityType: string,
  entityId?: string | null,
  metadata?: Record<string, unknown>
): AuditInput {
  return {
    orgId: req.auth?.orgId ?? "",
    actorId: req.auth?.userId,
    action,
    entityType,
    entityId,
    metadata,
    ip: req.ip,
    requestId: (req as { requestId?: string }).requestId,
  };
}
