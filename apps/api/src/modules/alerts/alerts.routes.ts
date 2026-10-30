import { Router } from "express";
import { PERMISSIONS } from "@frostguard/shared";
import { authenticate, requirePermission } from "../../middleware/auth";
import { ok, paginated } from "../../lib/http";
import * as service from "./alerts.service";

export const alertsRouter: Router = Router();
alertsRouter.use(authenticate);

alertsRouter.get("/", requirePermission(PERMISSIONS.INCIDENT_READ), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const result = await service.listAlerts({
      orgId: req.auth!.orgId,
      page,
      pageSize,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      severity: typeof req.query.severity === "string" ? req.query.severity : undefined,
      search: typeof req.query.search === "string" ? req.query.search : undefined,
    });
    return paginated(res, result.items, result.total, page, pageSize);
  } catch (err) {
    next(err);
  }
});

alertsRouter.post("/:id/acknowledge", requirePermission(PERMISSIONS.INCIDENT_WRITE), async (req, res, next) => {
  try {
    return ok(res, await service.acknowledgeAlert(req.auth!.orgId, req.auth!.userId, String(req.params.id), res.locals.requestId));
  } catch (err) {
    next(err);
  }
});
