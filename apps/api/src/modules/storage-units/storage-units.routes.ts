import { Router } from "express";
import { z } from "zod";
import { PERMISSIONS, storageUnitSchema, storageUnitUpdateSchema } from "@frostguard/shared";
import { authenticate, requirePermission } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ok, paginated } from "../../lib/http";
import * as service from "./storage-units.service";

export const storageUnitsRouter: Router = Router();
storageUnitsRouter.use(authenticate);

storageUnitsRouter.get("/", requirePermission(PERMISSIONS.WAREHOUSE_READ), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const result = await service.listStorageUnits({
      orgId: req.auth!.orgId,
      page,
      pageSize,
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      warehouseId: typeof req.query.warehouseId === "string" ? req.query.warehouseId : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      type: typeof req.query.type === "string" ? req.query.type : undefined,
    });
    return paginated(res, result.items, result.total, page, pageSize);
  } catch (err) {
    next(err);
  }
});

storageUnitsRouter.post("/", requirePermission(PERMISSIONS.WAREHOUSE_WRITE), validate(storageUnitSchema), async (req, res, next) => {
  try {
    return res
      .status(201)
      .json({ success: true, data: await service.createStorageUnit(req.auth!.orgId, req.auth!.userId, req.body, res.locals.requestId) });
  } catch (err) {
    next(err);
  }
});

storageUnitsRouter.get("/:id", requirePermission(PERMISSIONS.WAREHOUSE_READ), async (req, res, next) => {
  try {
    return ok(res, await service.getStorageUnit(req.auth!.orgId, String(req.params.id)));
  } catch (err) {
    next(err);
  }
});

storageUnitsRouter.patch("/:id", requirePermission(PERMISSIONS.WAREHOUSE_WRITE), validate(storageUnitUpdateSchema), async (req, res, next) => {
  try {
    return ok(res, await service.updateStorageUnit(req.auth!.orgId, req.auth!.userId, String(req.params.id), req.body, res.locals.requestId));
  } catch (err) {
    next(err);
  }
});

storageUnitsRouter.post(
  "/:id/maintenance",
  requirePermission(PERMISSIONS.WAREHOUSE_WRITE),
  validate(z.object({
    type: z.string().min(2).max(60),
    performedBy: z.string().min(2).max(160),
    notes: z.string().max(1000).optional().nullable(),
    performedAt: z.coerce.date().optional(),
    sensorId: z.string().optional().nullable(),
  })),
  async (req, res, next) => {
    try {
      return res.status(201).json({
        success: true,
        data: await service.addMaintenanceLog(req.auth!.orgId, req.auth!.userId, String(req.params.id), req.body, res.locals.requestId),
      });
    } catch (err) {
      next(err);
    }
  }
);
