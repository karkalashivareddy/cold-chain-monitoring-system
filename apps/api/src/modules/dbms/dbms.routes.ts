import { Router } from "express";
import { z } from "zod";
import { PERMISSIONS } from "@frostguard/shared";
import { authenticate, requirePermission } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ok } from "../../lib/http";
import { AppError } from "../../lib/errors";
import { env } from "../../config/env";
import * as service from "./dbms.service";

export const dbmsRouter: Router = Router();
if (env.isProduction) {
  dbmsRouter.use((_req, _res, next) => next(AppError.notFound("Resource not found")));
} else {
  dbmsRouter.use(authenticate);
}

dbmsRouter.get("/overview", requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (_req, res, next) => {
  try {
    return ok(res, await service.getOverview());
  } catch (err) {
    next(err);
  }
});

dbmsRouter.get("/tables", requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (_req, res, next) => {
  try {
    return ok(res, await service.getTableStats());
  } catch (err) {
    next(err);
  }
});

dbmsRouter.get("/views", requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (_req, res, next) => {
  try {
    return ok(res, await service.getViews());
  } catch (err) {
    next(err);
  }
});

dbmsRouter.get("/triggers", requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (_req, res, next) => {
  try {
    return ok(res, await service.getTriggers());
  } catch (err) {
    next(err);
  }
});

dbmsRouter.get("/routines", requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (_req, res, next) => {
  try {
    return ok(res, await service.getRoutines());
  } catch (err) {
    next(err);
  }
});

dbmsRouter.get(
  "/explain",
  requirePermission(PERMISSIONS.SETTINGS_MANAGE),
  validate(z.object({ query: z.enum(["telemetry-range", "open-excursions", "shipment-risk", "device-health"]).default("telemetry-range") }), "query"),
  async (req, res, next) => {
    try {
      const query = req.query.query as service.ExplainQuery;
      return ok(res, { query, plan: await service.explain(query, req.auth!.orgId) });
    } catch (err) {
      next(err);
    }
  }
);

dbmsRouter.get("/explain-reservation", requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req, res, next) => {
  try {
    return ok(res, await service.explainReservation(req.auth!.orgId));
  } catch (err) {
    next(err);
  }
});

dbmsRouter.get("/incident-summary", requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req, res, next) => {
  try {
    return ok(res, await service.incidentSummary(req.auth!.orgId));
  } catch (err) {
    next(err);
  }
});

dbmsRouter.post("/verify-rollback", requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req, res, next) => {
  try {
    return ok(res, await service.verifyRollback(req.auth!.orgId, req.auth!.userId));
  } catch (err) {
    next(err);
  }
});
