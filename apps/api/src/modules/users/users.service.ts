import crypto from "node:crypto";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { hashPassword } from "../../security/password";
import { writeAudit } from "../../services/audit";

export async function listMembers(orgId: string) {
  return prisma.membership.findMany({
    where: { orgId },
    include: {
      user: { select: { id: true, email: true, fullName: true, isActive: true, lastLoginAt: true, createdAt: true } },
      role: { select: { id: true, key: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function createMember(
  orgId: string,
  actorId: string,
  input: { email: string; fullName: string; roleKey: string },
  requestId?: string
) {
  const role = await prisma.role.findUnique({ where: { key: input.roleKey } });
  if (!role) throw AppError.badRequest("Unknown role");
  if (role.key === "owner") throw AppError.forbidden("Owner role cannot be granted through this endpoint");

  const tempPassword = `Fg-${crypto.randomBytes(9).toString("base64url")}`;
  const passwordHash = await hashPassword(tempPassword);

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    const membership = await prisma.membership.findUnique({ where: { orgId_userId: { orgId, userId: existing.id } } });
    if (membership) throw AppError.conflict("User already belongs to this organization");
    await prisma.membership.create({ data: { orgId, userId: existing.id, roleId: role.id } });
    await writeAudit(prisma, {
      orgId,
      actorId,
      action: "user.membership_added",
      entityType: "user",
      entityId: existing.id,
      metadata: { role: role.key },
      requestId,
    });
    return { userId: existing.id, temporaryPassword: null };
  }

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { email: input.email, fullName: input.fullName, passwordHash },
    });
    await tx.membership.create({ data: { orgId, userId: created.id, roleId: role.id } });
    await tx.notificationLog.create({
      data: {
        orgId,
        userId: created.id,
        channel: "IN_APP",
        subject: "Welcome to FROSTGUARD",
        body: "Your account has been provisioned. Change your temporary password on first sign-in.",
        status: "SENT",
        sentAt: new Date(),
      },
    });
    await writeAudit(tx, {
      orgId,
      actorId,
      action: "user.created",
      entityType: "user",
      entityId: created.id,
      metadata: { email: input.email, role: role.key },
      requestId,
    });
    return created;
  });

  return { userId: user.id, temporaryPassword: tempPassword };
}

export async function updateMemberRole(
  orgId: string,
  actorId: string,
  userId: string,
  roleKey: string,
  requestId?: string
) {
  const role = await prisma.role.findUnique({ where: { key: roleKey } });
  if (!role) throw AppError.badRequest("Unknown role");

  return prisma.$transaction(async (tx) => {
    const membership = await tx.membership.findUnique({
      where: { orgId_userId: { orgId, userId } },
      include: { role: true },
    });
    if (!membership) throw AppError.notFound("Member not found");

    if (membership.role.key === "owner" && role.key !== "owner") {
      const owners = await tx.membership.count({ where: { orgId, role: { key: "owner" } } });
      if (owners <= 1) throw AppError.conflict("Cannot remove the last organization owner");
    }

    const updated = await tx.membership.update({
      where: { id: membership.id },
      data: { roleId: role.id },
      include: { role: true, user: { select: { id: true, email: true, fullName: true } } },
    });
    await writeAudit(tx, {
      orgId,
      actorId,
      action: "user.role_changed",
      entityType: "user",
      entityId: userId,
      metadata: { from: membership.role.key, to: role.key },
      requestId,
    });
    return updated;
  });
}

export async function removeMember(orgId: string, actorId: string, userId: string, requestId?: string) {
  if (userId === actorId) throw AppError.badRequest("You cannot remove your own membership");
  return prisma.$transaction(async (tx) => {
    const membership = await tx.membership.findUnique({
      where: { orgId_userId: { orgId, userId } },
      include: { role: true },
    });
    if (!membership) throw AppError.notFound("Member not found");
    if (membership.role.key === "owner") {
      const owners = await tx.membership.count({ where: { orgId, role: { key: "owner" } } });
      if (owners <= 1) throw AppError.conflict("Cannot remove the last organization owner");
    }
    await tx.membership.delete({ where: { id: membership.id } });
    await writeAudit(tx, {
      orgId,
      actorId,
      action: "user.membership_removed",
      entityType: "user",
      entityId: userId,
      metadata: { role: membership.role.key },
      requestId,
    });
    return { removed: true };
  });
}
