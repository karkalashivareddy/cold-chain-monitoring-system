import { Router } from "express";
import { PERMISSIONS } from "@frostguard/shared";
import { authenticate, requirePermission } from "../../middleware/auth";
import { paginated } from "../../lib/http";
import * as service from "./audit.service";

export const auditRouter: Router = Router();
auditRouter.use(authenticate);

auditRouter.get("/", requirePermission(PERMISSIONS.AUDIT_READ), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
    const result = await service.listAuditLogs({
      orgId: req.auth!.orgId,
      page,
      pageSize,
      entityType: typeof req.query.entityType === "string" ? req.query.entityType : undefined,
      action: typeof req.query.action === "string" ? req.query.action : undefined,
      actorId: typeof req.query.actorId === "string" ? req.query.actorId : undefined,
      from: typeof req.query.from === "string" ? new Date(req.query.from) : undefined,
      to: typeof req.query.to === "string" ? new Date(req.query.to) : undefined,
    });
    return paginated(res, result.items, result.total, page, pageSize);
  } catch (err) {
    next(err);
  }
});
