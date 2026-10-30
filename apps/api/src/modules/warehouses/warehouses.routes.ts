import { Router } from "express";
import { PERMISSIONS, warehouseSchema } from "@frostguard/shared";
import { authenticate, requirePermission } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ok } from "../../lib/http";
import * as service from "./warehouses.service";

export const warehousesRouter: Router = Router();
warehousesRouter.use(authenticate);

warehousesRouter.get("/", requirePermission(PERMISSIONS.WAREHOUSE_READ), async (req, res, next) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    return ok(res, await service.listWarehouses(req.auth!.orgId, search));
  } catch (err) {
    next(err);
  }
});

warehousesRouter.post("/", requirePermission(PERMISSIONS.WAREHOUSE_WRITE), validate(warehouseSchema), async (req, res, next) => {
  try {
    const warehouse = await service.createWarehouse(req.auth!.orgId, req.auth!.userId, req.body, res.locals.requestId);
    return res.status(201).json({ success: true, data: warehouse, meta: { requestId: res.locals.requestId } });
  } catch (err) {
    next(err);
  }
});

warehousesRouter.get("/:id", requirePermission(PERMISSIONS.WAREHOUSE_READ), async (req, res, next) => {
  try {
    return ok(res, await service.getWarehouse(req.auth!.orgId, String(req.params.id)));
  } catch (err) {
    next(err);
  }
});

warehousesRouter.patch("/:id", requirePermission(PERMISSIONS.WAREHOUSE_WRITE), validate(warehouseSchema.partial()), async (req, res, next) => {
  try {
    return ok(res, await service.updateWarehouse(req.auth!.orgId, req.auth!.userId, String(req.params.id), req.body, res.locals.requestId));
  } catch (err) {
    next(err);
  }
});
