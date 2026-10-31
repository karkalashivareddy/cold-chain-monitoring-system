import { Router } from "express";
import { z } from "zod";
import {
  deliverShipmentSchema,
  PERMISSIONS,
  shipmentEventSchema,
  shipmentSchema,
} from "@frostguard/shared";
import { authenticate, requirePermission } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ok, paginated } from "../../lib/http";
import * as service from "./shipments.service";

export const shipmentsRouter: Router = Router();
shipmentsRouter.use(authenticate);

shipmentsRouter.get("/", requirePermission(PERMISSIONS.SHIPMENT_READ), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const result = await service.listShipments({
      orgId: req.auth!.orgId,
      page,
      pageSize,
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
    });
    return paginated(res, result.items, result.total, page, pageSize);
  } catch (err) {
    next(err);
  }
});

shipmentsRouter.get("/map", requirePermission(PERMISSIONS.SHIPMENT_READ), async (req, res, next) => {
  try {
    return ok(res, await service.getShipmentMap(req.auth!.orgId));
  } catch (err) {
    next(err);
  }
});

shipmentsRouter.post("/", requirePermission(PERMISSIONS.SHIPMENT_WRITE), validate(shipmentSchema), async (req, res, next) => {
  try {
    const shipment = await service.createShipment(req.auth!.orgId, req.auth!.userId, req.body, res.locals.requestId);
    return res.status(201).json({ success: true, data: shipment, meta: { requestId: res.locals.requestId } });
  } catch (err) {
    next(err);
  }
});

shipmentsRouter.get("/:id", requirePermission(PERMISSIONS.SHIPMENT_READ), async (req, res, next) => {
  try {
    return ok(res, await service.getShipment(req.auth!.orgId, String(req.params.id)));
  } catch (err) {
    next(err);
  }
});

shipmentsRouter.post("/:id/dispatch", requirePermission(PERMISSIONS.SHIPMENT_DISPATCH), async (req, res, next) => {
  try {
    return ok(res, await service.dispatchShipment(req.auth!.orgId, req.auth!.userId, String(req.params.id), res.locals.requestId));
  } catch (err) {
    next(err);
  }
});

shipmentsRouter.post(
  "/:id/deliver",
  requirePermission(PERMISSIONS.SHIPMENT_DISPATCH),
  validate(deliverShipmentSchema),
  async (req, res, next) => {
    try {
      return ok(res, await service.deliverShipment(req.auth!.orgId, req.auth!.userId, String(req.params.id), req.body, res.locals.requestId));
    } catch (err) {
      next(err);
    }
  }
);

shipmentsRouter.patch(
  "/:id/position",
  requirePermission(PERMISSIONS.SHIPMENT_WRITE),
  validate(
    z.object({
      lat: z.coerce.number().min(-90).max(90),
      lng: z.coerce.number().min(-180).max(180),
      progressPercent: z.coerce.number().min(0).max(100).optional(),
      status: z.enum(["DISPATCHED", "IN_TRANSIT", "DELAYED"]).optional(),
      message: z.string().max(300).optional(),
    })
  ),
  async (req, res, next) => {
    try {
      return ok(res, await service.updatePosition(req.auth!.orgId, req.auth!.userId, String(req.params.id), req.body, res.locals.requestId));
    } catch (err) {
      next(err);
    }
  }
);

shipmentsRouter.post(
  "/:id/events",
  requirePermission(PERMISSIONS.SHIPMENT_WRITE),
  validate(shipmentEventSchema),
  async (req, res, next) => {
    try {
      const event = await service.addShipmentEvent(
        req.auth!.orgId,
        req.auth!.userId,
        String(req.params.id),
        req.body,
        res.locals.requestId
      );
      return res.status(201).json({ success: true, data: event, meta: { requestId: res.locals.requestId } });
    } catch (err) {
      next(err);
    }
  }
);

shipmentsRouter.post("/:id/cancel", requirePermission(PERMISSIONS.SHIPMENT_WRITE), async (req, res, next) => {
  try {
    return ok(res, await service.cancelShipment(req.auth!.orgId, req.auth!.userId, String(req.params.id), res.locals.requestId));
  } catch (err) {
    next(err);
  }
});
