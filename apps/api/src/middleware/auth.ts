import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { verifyAccessToken } from "../security/tokens";

export type AuthContext = {
  userId: string;
  orgId: string;
  roleKey: string;
  permissions: Set<string>;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7).trim();
  const cookie = req.cookies?.fg_access as string | undefined;
  return cookie ?? null;
}

/**
 * Every authenticated request revalidates the membership in the database.
 * A revoked membership or changed role takes effect immediately rather than
 * waiting for an access token to expire.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = extractToken(req);
    if (!token) throw AppError.unauthorized();

    const claims = verifyAccessToken(token);
    if (!claims) throw AppError.unauthorized("Session expired or invalid");

    const membership = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId: claims.org, userId: claims.sub } },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
        user: { select: { isActive: true, email: true } },
      },
    });

    if (!membership || !membership.user.isActive) {
      throw AppError.unauthorized("Account is inactive or membership revoked");
    }

    req.auth = {
      userId: claims.sub,
      orgId: claims.org,
      roleKey: membership.role.key,
      permissions: new Set(membership.role.permissions.map((rp) => rp.permission.key)),
    };
    next();
  } catch (err) {
    next(err);
  }
}

export function requirePermission(...required: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(AppError.unauthorized());
    const has = required.every((p) => req.auth!.permissions.has(p));
    if (!has) return next(AppError.forbidden(`Missing permission: ${required.join(", ")}`));
    next();
  };
}

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(AppError.unauthorized());
    if (!roles.includes(req.auth.roleKey)) return next(AppError.forbidden());
    next();
  };
}
