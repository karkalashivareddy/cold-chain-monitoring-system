import type { SimulationScenario } from "@frostguard/shared";
import { Router } from "express";
import { simulationStartSchema, PERMISSIONS } from "@frostguard/shared";
import { authenticate, requirePermission } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ok } from "../../lib/http";
import * as service from "./simulations.service";

export const simulationsRouter: Router = Router();
simulationsRouter.use(authenticate);

simulationsRouter.get("/", requirePermission(PERMISSIONS.DEVICE_READ), async (req, res, next) => {
  try {
    return ok(res, await service.listSimulations(req.auth!.orgId));
  } catch (err) {
    next(err);
  }
});

simulationsRouter.post(
  "/devices/:sensorId/start",
  requirePermission(PERMISSIONS.TELEMETRY_WRITE),
  validate(simulationStartSchema),
  async (req, res, next) => {
    try {
      const { scenario, intervalMs } = req.body as { scenario: SimulationScenario; intervalMs: number };
      const sim = await service.startSimulation(
        req.auth!.orgId,
        req.auth!.userId,
        String(req.params.sensorId),
        scenario,
        intervalMs,
        res.locals.requestId
      );
      return res.status(201).json({ success: true, data: sim, meta: { requestId: res.locals.requestId } });
    } catch (err) {
      next(err);
    }
  }
);

simulationsRouter.post("/devices/:sensorId/stop", requirePermission(PERMISSIONS.TELEMETRY_WRITE), async (req, res, next) => {
  try {
    return ok(res, await service.stopSimulation(req.auth!.orgId, req.auth!.userId, String(req.params.sensorId), res.locals.requestId));
  } catch (err) {
    next(err);
  }
});

simulationsRouter.post("/devices/:sensorId/reset", requirePermission(PERMISSIONS.TELEMETRY_WRITE), async (req, res, next) => {
  try {
    return ok(res, await service.resetSimulation(req.auth!.orgId, req.auth!.userId, String(req.params.sensorId), res.locals.requestId));
  } catch (err) {
    next(err);
  }
});
