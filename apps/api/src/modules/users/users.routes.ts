import { Router } from "express";
import { z } from "zod";
import { PERMISSIONS, ROLE_KEYS } from "@frostguard/shared";
import { authenticate, requirePermission } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ok } from "../../lib/http";
import * as service from "./users.service";
import { prisma } from "../../lib/prisma";

export const usersRouter: Router = Router();
usersRouter.use(authenticate);

usersRouter.get("/", requirePermission(PERMISSIONS.USER_READ), async (req, res, next) => {
  try {
    return ok(res, await service.listMembers(req.auth!.orgId));
  } catch (err) {
    next(err);
  }
});

usersRouter.get("/assignable", requirePermission(PERMISSIONS.INCIDENT_READ), async (req, res, next) => {
  try {
    const members = await prisma.membership.findMany({
      where: { orgId: req.auth!.orgId, user: { isActive: true } },
      select: { user: { select: { id: true, fullName: true, email: true } }, role: { select: { key: true } } },
    });
    return ok(res, members.map((m) => ({ id: m.user.id, fullName: m.user.fullName, email: m.user.email, role: m.role.key })));
  } catch (err) {
    next(err);
  }
});

usersRouter.post(
  "/",
  requirePermission(PERMISSIONS.USER_MANAGE),
  validate(
    z.object({
      email: z.string().email().max(200),
      fullName: z.string().min(2).max(160),
      roleKey: z.enum(ROLE_KEYS),
    })
  ),
  async (req, res, next) => {
    try {
      const result = await service.createMember(req.auth!.orgId, req.auth!.userId, req.body, res.locals.requestId);
      return res.status(201).json({
        success: true,
        data: result,
        meta: {
          requestId: res.locals.requestId,
          notice: result.temporaryPassword
            ? "Share the temporary password securely; it is shown only once."
            : "Existing user added to the organization.",
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

usersRouter.patch(
  "/:userId/role",
  requirePermission(PERMISSIONS.USER_MANAGE),
  validate(z.object({ roleKey: z.enum(ROLE_KEYS) })),
  async (req, res, next) => {
    try {
      return ok(res, await service.updateMemberRole(req.auth!.orgId, req.auth!.userId, String(req.params.userId), req.body.roleKey, res.locals.requestId));
    } catch (err) {
      next(err);
    }
  }
);

usersRouter.delete("/:userId", requirePermission(PERMISSIONS.USER_MANAGE), async (req, res, next) => {
  try {
    return ok(res, await service.removeMember(req.auth!.orgId, req.auth!.userId, String(req.params.userId), res.locals.requestId));
  } catch (err) {
    next(err);
  }
});
