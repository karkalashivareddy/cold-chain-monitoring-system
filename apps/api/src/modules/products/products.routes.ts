import { Router } from "express";
import { productSchema, productUpdateSchema } from "@frostguard/shared";
import { authenticate, requirePermission } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ok, paginated } from "../../lib/http";
import { PERMISSIONS } from "@frostguard/shared";
import * as service from "./products.service";

export const productsRouter: Router = Router();
productsRouter.use(authenticate);

productsRouter.get("/", requirePermission(PERMISSIONS.PRODUCT_READ), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const result = await service.listProducts({
      orgId: req.auth!.orgId,
      page,
      pageSize,
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      category: typeof req.query.category === "string" ? req.query.category : undefined,
      active: typeof req.query.active === "string" ? req.query.active : undefined,
      sort: typeof req.query.sort === "string" ? req.query.sort : undefined,
      order: req.query.order === "asc" ? "asc" : "desc",
    });
    return paginated(res, result.items, result.total, page, pageSize);
  } catch (err) {
    next(err);
  }
});

productsRouter.post("/", requirePermission(PERMISSIONS.PRODUCT_WRITE), validate(productSchema), async (req, res, next) => {
  try {
    const product = await service.createProduct(req.auth!.orgId, req.auth!.userId, req.body, res.locals.requestId);
    return res.status(201).json({ success: true, data: product, meta: { requestId: res.locals.requestId } });
  } catch (err) {
    next(err);
  }
});

productsRouter.get("/:id", requirePermission(PERMISSIONS.PRODUCT_READ), async (req, res, next) => {
  try {
    return ok(res, await service.getProduct(req.auth!.orgId, String(req.params.id)));
  } catch (err) {
    next(err);
  }
});

productsRouter.patch("/:id", requirePermission(PERMISSIONS.PRODUCT_WRITE), validate(productUpdateSchema), async (req, res, next) => {
  try {
    const product = await service.updateProduct(req.auth!.orgId, req.auth!.userId, String(req.params.id), req.body, res.locals.requestId);
    return ok(res, product);
  } catch (err) {
    next(err);
  }
});

productsRouter.delete("/:id", requirePermission(PERMISSIONS.PRODUCT_WRITE), async (req, res, next) => {
  try {
    const product = await service.deactivateProduct(req.auth!.orgId, req.auth!.userId, String(req.params.id), res.locals.requestId);
    return ok(res, product);
  } catch (err) {
    next(err);
  }
});
