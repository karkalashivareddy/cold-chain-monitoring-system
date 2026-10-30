import { Router } from "express";
import { deviceSchema, PERMISSIONS } from "@frostguard/shared";
import { z } from "zod";
import { authenticate, requirePermission } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ok, paginated } from "../../lib/http";
import * as service from "./devices.service";

export const devicesRouter: Router = Router();
devicesRouter.use(authenticate);

devicesRouter.get("/", requirePermission(PERMISSIONS.DEVICE_READ), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const result = await service.listDevices({
      orgId: req.auth!.orgId,
      page,
      pageSize,
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      storageUnitId: typeof req.query.storageUnitId === "string" ? req.query.storageUnitId : undefined,
      shipmentId: typeof req.query.shipmentId === "string" ? req.query.shipmentId : undefined,
    });
    return paginated(res, result.items, result.total, page, pageSize);
  } catch (err) {
    next(err);
  }
});

devicesRouter.get("/stats", requirePermission(PERMISSIONS.DEVICE_READ), async (req, res, next) => {
  try {
    return ok(res, await service.getDeviceStats(req.auth!.orgId));
  } catch (err) {
    next(err);
  }
});

devicesRouter.post("/", requirePermission(PERMISSIONS.DEVICE_MANAGE), validate(deviceSchema), async (req, res, next) => {
  try {
    const result = await service.createDevice(req.auth!.orgId, req.auth!.userId, req.body, res.locals.requestId);
    return res.status(201).json({
      success: true,
      data: result,
      meta: { requestId: res.locals.requestId, notice: "Store the device API key now; it is never shown again." },
    });
  } catch (err) {
    next(err);
  }
});

devicesRouter.get("/:id", requirePermission(PERMISSIONS.DEVICE_READ), async (req, res, next) => {
  try {
    return ok(res, await service.getDevice(req.auth!.orgId, String(req.params.id)));
  } catch (err) {
    next(err);
  }
});

devicesRouter.patch(
  "/:id",
  requirePermission(PERMISSIONS.DEVICE_MANAGE),
  validate(deviceSchema.partial().extend({ status: z.enum(["ONLINE", "OFFLINE", "MAINTENANCE", "REVOKED"]).optional() })),
  async (req, res, next) => {
    try {
      return ok(res, await service.updateDevice(req.auth!.orgId, req.auth!.userId, String(req.params.id), req.body, res.locals.requestId));
    } catch (err) {
      next(err);
    }
  }
);

devicesRouter.post("/:id/rotate-key", requirePermission(PERMISSIONS.DEVICE_MANAGE), async (req, res, next) => {
  try {
    return ok(res, await service.rotateDeviceKey(req.auth!.orgId, req.auth!.userId, String(req.params.id), res.locals.requestId));
  } catch (err) {
    next(err);
  }
});

devicesRouter.post("/:id/revoke", requirePermission(PERMISSIONS.DEVICE_MANAGE), async (req, res, next) => {
  try {
    return ok(res, await service.revokeDevice(req.auth!.orgId, req.auth!.userId, String(req.params.id), res.locals.requestId));
  } catch (err) {
    next(err);
  }
});
