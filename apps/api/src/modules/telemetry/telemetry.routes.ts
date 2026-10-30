import { Router } from "express";
import { telemetryReadingSchema, PERMISSIONS } from "@frostguard/shared";
import { authenticate, requirePermission } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { telemetryLimiter } from "../../middleware/security";
import { ok, paginated } from "../../lib/http";
import { verifyTelemetrySignature } from "../../security/deviceAuth";
import { env } from "../../config/env";
import * as service from "./telemetry.service";

export const telemetryRouter: Router = Router();

/**
 * Device-facing endpoint. Uses a per-device API key (not a user session) and
 * optional HMAC signature over the canonical payload for integrity.
 */
telemetryRouter.post("/readings", telemetryLimiter, validate(telemetryReadingSchema), async (req, res, next) => {
  try {
    const deviceKey = req.headers["x-device-key"];
    if (typeof deviceKey !== "string") {
      return res.status(401).json({
        success: false,
        error: { code: "DEVICE_AUTH_FAILED", message: "Missing device credential" },
        meta: { requestId: res.locals.requestId },
      });
    }
    if (req.body.signature && !verifyTelemetrySignature(req.body, env.DEVICE_HMAC_SECRET)) {
      return res.status(401).json({
        success: false,
        error: { code: "DEVICE_AUTH_FAILED", message: "Invalid telemetry signature" },
        meta: { requestId: res.locals.requestId },
      });
    }
    const result = await service.ingestReading(req.body, {
      deviceKey,
      ip: req.ip,
      requestId: res.locals.requestId,
    });
    return res.status(result.duplicate ? 200 : 201).json({
      success: true,
      data: result,
      meta: { requestId: res.locals.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// Operator-facing history endpoints.
telemetryRouter.use(authenticate);

telemetryRouter.get("/readings", requirePermission(PERMISSIONS.TELEMETRY_READ), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize) || 50));
    const result = await service.listReadings({
      orgId: req.auth!.orgId,
      page,
      pageSize,
      sensorId: typeof req.query.sensorId === "string" ? req.query.sensorId : undefined,
      storageUnitId: typeof req.query.storageUnitId === "string" ? req.query.storageUnitId : undefined,
      shipmentId: typeof req.query.shipmentId === "string" ? req.query.shipmentId : undefined,
      from: typeof req.query.from === "string" ? new Date(req.query.from) : undefined,
      to: typeof req.query.to === "string" ? new Date(req.query.to) : undefined,
      simulated: req.query.simulated === "true" ? true : req.query.simulated === "false" ? false : undefined,
    });
    return paginated(res, result.items, result.total, page, pageSize);
  } catch (err) {
    next(err);
  }
});

telemetryRouter.get("/latest", requirePermission(PERMISSIONS.TELEMETRY_READ), async (req, res, next) => {
  try {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 12));
    return ok(res, await service.latestReadings(req.auth!.orgId, limit));
  } catch (err) {
    next(err);
  }
});

telemetryRouter.get("/series", requirePermission(PERMISSIONS.TELEMETRY_READ), async (req, res, next) => {
  try {
    const sensorId = typeof req.query.sensorId === "string" ? req.query.sensorId : "";
    if (!sensorId) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "sensorId is required" }, meta: { requestId: res.locals.requestId } });
    const to = typeof req.query.to === "string" ? new Date(req.query.to) : new Date();
    const from = typeof req.query.from === "string" ? new Date(req.query.from) : new Date(to.getTime() - 24 * 3600_000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid date range" }, meta: { requestId: res.locals.requestId } });
    }
    if (to.getTime() - from.getTime() > 90 * 86_400_000) {
      return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Range cannot exceed 90 days" }, meta: { requestId: res.locals.requestId } });
    }
    const bucketMinutes = Math.min(1440, Math.max(1, Number(req.query.bucketMinutes) || 15));
    return ok(res, await service.getTemperatureSeries({ orgId: req.auth!.orgId, sensorId, from, to, bucketMinutes }));
  } catch (err) {
    next(err);
  }
});
