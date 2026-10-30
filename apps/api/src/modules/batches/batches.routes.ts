import { Router } from "express";
import { batchSchema, batchUpdateSchema, PERMISSIONS } from "@frostguard/shared";
import { authenticate, requirePermission } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ok, paginated } from "../../lib/http";
import * as service from "./batches.service";

export const batchesRouter: Router = Router();
batchesRouter.use(authenticate);

batchesRouter.get("/", requirePermission(PERMISSIONS.BATCH_READ), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const result = await service.listBatches({
      orgId: req.auth!.orgId,
      page,
      pageSize,
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      productId: typeof req.query.productId === "string" ? req.query.productId : undefined,
      storageUnitId: typeof req.query.storageUnitId === "string" ? req.query.storageUnitId : undefined,
      expiringDays: req.query.expiringDays ? Number(req.query.expiringDays) : undefined,
    });
    return paginated(res, result.items, result.total, page, pageSize);
  } catch (err) {
    next(err);
  }
});

batchesRouter.post("/", requirePermission(PERMISSIONS.BATCH_WRITE), validate(batchSchema), async (req, res, next) => {
  try {
    const batch = await service.createBatch(req.auth!.orgId, req.auth!.userId, req.body, res.locals.requestId);
    return res.status(201).json({ success: true, data: batch, meta: { requestId: res.locals.requestId } });
  } catch (err) {
    next(err);
  }
});

batchesRouter.get("/:id", requirePermission(PERMISSIONS.BATCH_READ), async (req, res, next) => {
  try {
    return ok(res, await service.getBatch(req.auth!.orgId, String(req.params.id)));
  } catch (err) {
    next(err);
  }
});

batchesRouter.get("/:id/traceability", requirePermission(PERMISSIONS.BATCH_READ), async (req, res, next) => {
  try {
    return ok(res, await service.getBatchTraceability(req.auth!.orgId, String(req.params.id)));
  } catch (err) {
    next(err);
  }
});

batchesRouter.patch("/:id", requirePermission(PERMISSIONS.BATCH_WRITE), validate(batchUpdateSchema), async (req, res, next) => {
  try {
    return ok(res, await service.updateBatch(req.auth!.orgId, req.auth!.userId, String(req.params.id), req.body, res.locals.requestId));
  } catch (err) {
    next(err);
  }
});
