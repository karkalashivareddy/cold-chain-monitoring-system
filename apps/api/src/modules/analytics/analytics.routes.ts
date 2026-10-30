import { Router } from "express";
import { PERMISSIONS } from "@frostguard/shared";
import { authenticate, requirePermission } from "../../middleware/auth";
import { ok } from "../../lib/http";
import * as service from "./analytics.service";

export const analyticsRouter: Router = Router();
analyticsRouter.use(authenticate);

analyticsRouter.get("/risk", requirePermission(PERMISSIONS.ANALYTICS_READ), async (req, res, next) => {
  try {
    return ok(res, await service.getRiskAnalytics(req.auth!.orgId));
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get("/warehouses", requirePermission(PERMISSIONS.ANALYTICS_READ), async (req, res, next) => {
  try {
    return ok(res, await service.getWarehousePerformance(req.auth!.orgId));
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get("/devices", requirePermission(PERMISSIONS.ANALYTICS_READ), async (req, res, next) => {
  try {
    return ok(res, await service.getDeviceReliability(req.auth!.orgId));
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get("/expiring", requirePermission(PERMISSIONS.ANALYTICS_READ), async (req, res, next) => {
  try {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    return ok(res, await service.getExpiringBatches(req.auth!.orgId, days));
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get("/delivery", requirePermission(PERMISSIONS.ANALYTICS_READ), async (req, res, next) => {
  try {
    return ok(res, await service.getDeliveryPerformance(req.auth!.orgId));
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get("/", requirePermission(PERMISSIONS.ANALYTICS_READ), async (req, res, next) => {
  try {
    return ok(res, await service.getAnalytics(req.auth!.orgId));
  } catch (err) {
    next(err);
  }
});
