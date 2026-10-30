import { Router } from "express";
import { PERMISSIONS } from "@frostguard/shared";
import { authenticate, requirePermission } from "../../middleware/auth";
import { ok } from "../../lib/http";
import * as service from "./dashboard.service";

export const dashboardRouter: Router = Router();
dashboardRouter.use(authenticate);

dashboardRouter.get("/", requirePermission(PERMISSIONS.ANALYTICS_READ), async (req, res, next) => {
  try {
    return ok(res, await service.getDashboard(req.auth!.orgId));
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get("/overview", requirePermission(PERMISSIONS.ANALYTICS_READ), async (req, res, next) => {
  try {
    return ok(res, await service.getOverview(req.auth!.orgId));
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get("/temperature-trends", requirePermission(PERMISSIONS.ANALYTICS_READ), async (req, res, next) => {
  try {
    const hours = Math.min(168, Math.max(1, Number(req.query.hours) || 24));
    return ok(res, await service.getTemperatureTrend(req.auth!.orgId, hours));
  } catch (err) {
    next(err);
  }
});
