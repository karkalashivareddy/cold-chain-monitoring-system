import { Router } from "express";
import type { Request } from "express";
import { PERMISSIONS } from "@frostguard/shared";
import { authenticate, requirePermission } from "../../middleware/auth";
import { AppError } from "../../lib/errors";
import * as service from "./reports.service";

export const reportsRouter: Router = Router();
reportsRouter.use(authenticate);

function range(req: Request) {
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : new Date();
  const from = typeof req.query.from === "string" ? new Date(req.query.from) : new Date(Date.now() - 7 * 86_400_000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw AppError.badRequest("Invalid date range");
  if (from > to) throw AppError.badRequest("'from' must be before 'to'");
  return { from, to };
}

reportsRouter.get("/temperature", requirePermission(PERMISSIONS.REPORT_READ), async (req, res, next) => {
  try {
    const { from, to } = range(req);
    return await service.temperatureReport(res, req.auth!.orgId, {
      sensorId: typeof req.query.sensorId === "string" ? req.query.sensorId : undefined,
      simulated: req.query.simulated === "true" ? true : req.query.simulated === "false" ? false : undefined,
      from,
      to,
    });
  } catch (err) {
    next(err);
  }
});

reportsRouter.get("/shipments", requirePermission(PERMISSIONS.REPORT_READ), async (req, res, next) => {
  try {
    const { from, to } = range(req);
    return await service.shipmentReport(res, req.auth!.orgId, from, to);
  } catch (err) {
    next(err);
  }
});

reportsRouter.get("/incidents", requirePermission(PERMISSIONS.REPORT_READ), async (req, res, next) => {
  try {
    const { from, to } = range(req);
    return await service.incidentReport(res, req.auth!.orgId, from, to);
  } catch (err) {
    next(err);
  }
});

reportsRouter.get("/batch/:id", requirePermission(PERMISSIONS.REPORT_READ), async (req, res, next) => {
  try {
    return await service.batchTraceabilityReport(res, req.auth!.orgId, String(req.params.id));
  } catch (err) {
    next(err);
  }
});

reportsRouter.get("/summary.pdf", requirePermission(PERMISSIONS.REPORT_READ), async (req, res, next) => {
  try {
    return await service.summaryPdf(res, req.auth!.orgId);
  } catch (err) {
    next(err);
  }
});
