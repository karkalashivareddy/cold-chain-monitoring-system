import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { verifyPassword } from "../../security/password";
import {
  generateRefreshToken,
  sha256,
  signAccessToken,
} from "../../security/tokens";
import { env } from "../../config/env";
import type { SessionUser } from "@frostguard/shared";

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
};

export async function issueSession(
  userId: string,
  orgId: string,
  roleKey: string,
  meta: { ip?: string; userAgent?: string },
  familyId?: string
): Promise<TokenPair> {
  const accessToken = signAccessToken({ sub: userId, org: orgId, role: roleKey });
  const refresh = generateRefreshToken();
  const family = familyId ?? refresh.familyId;
  const expiresAt = new Date(Date.now() + env.refreshTtlMs);

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: refresh.hash,
      familyId: family,
      expiresAt,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 255) ?? null,
    },
  });

  return { accessToken, refreshToken: refresh.token, expiresAt };
}

export async function login(
  email: string,
  password: string,
  organizationSlug: string | undefined,
  meta: { ip?: string; userAgent?: string }
): Promise<{ user: SessionUser; tokens: TokenPair }> {
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      memberships: {
        include: {
          organization: true,
          role: { include: { permissions: { include: { permission: true } } } },
          user: false,
        },
      },
    },
  });

  // Uniform failure message prevents account enumeration. Verify a dummy hash
  // when the user does not exist to keep timing roughly constant.
  const hash = user?.passwordHash ?? "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$Zm9vYmFyYmF6cXV4Zm9vYmFyYmF6cXV4Zm9vYmFyYmE";
  const valid = await verifyPassword(hash, password);
  if (!user || !valid || !user.isActive) {
    throw AppError.unauthorized("Invalid email or password");
  }

  const membership = organizationSlug
    ? user.memberships.find((m) => m.organization.slug === organizationSlug)
    : user.memberships[0];

  if (!membership) throw AppError.forbidden("No organization membership found");

  const tokens = await issueSession(user.id, membership.orgId, membership.role.key, meta);

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    prisma.auditLog.create({
      data: {
        orgId: membership.orgId,
        actorId: user.id,
        action: "auth.login",
        entityType: "user",
        entityId: user.id,
        metadata: { ip: meta.ip ?? null },
        ip: meta.ip ?? null,
      },
    }),
  ]);

  return {
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: membership.role.key as SessionUser["role"],
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        timezone: membership.organization.timezone,
      },
      permissions: membership.role.permissions.map((p) => p.permission.key),
    },
    tokens,
  };
}

export async function rotateRefreshToken(
  token: string,
  meta: { ip?: string; userAgent?: string }
): Promise<TokenPair> {
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      user: {
        include: {
          memberships: { include: { role: true } },
        },
      },
    },
  });

  if (!record) throw AppError.unauthorized("Invalid refresh token");

  // Reuse of a revoked token means it was stolen: revoke the entire family.
  if (record.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { familyId: record.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw AppError.unauthorized("Refresh token reuse detected; session revoked");
  }
  if (record.expiresAt < new Date()) throw AppError.unauthorized("Refresh token expired");
  if (!record.user.isActive) throw AppError.unauthorized("Account inactive");

  const membership = record.user.memberships[0];
  if (!membership) throw AppError.unauthorized("Membership revoked");

  const next = generateRefreshToken();
  const expiresAt = new Date(Date.now() + env.refreshTtlMs);

  await prisma.$transaction(async (tx) => {
    const created = await tx.refreshToken.create({
      data: {
        userId: record.userId,
        tokenHash: next.hash,
        familyId: record.familyId,
        expiresAt,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent?.slice(0, 255) ?? null,
      },
    });
    await tx.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date(), replacedById: created.id },
    });
  });

  return {
    accessToken: signAccessToken({
      sub: record.userId,
      org: membership.orgId,
      role: membership.role.key,
    }),
    refreshToken: next.token,
    expiresAt,
  };
}

export async function revokeSession(token: string | undefined): Promise<void> {
  if (!token) return;
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record) return;
  await prisma.refreshToken.updateMany({
    where: { familyId: record.familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getSessionUser(userId: string, orgId: string): Promise<SessionUser> {
  const membership = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId, userId } },
    include: {
      organization: true,
      user: true,
      role: { include: { permissions: { include: { permission: true } } } },
    },
  });
  if (!membership) throw AppError.unauthorized();

  return {
    id: membership.user.id,
    email: membership.user.email,
    fullName: membership.user.fullName,
    role: membership.role.key as SessionUser["role"],
    organization: {
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
      timezone: membership.organization.timezone,
    },
    permissions: membership.role.permissions.map((p) => p.permission.key),
  };
}
