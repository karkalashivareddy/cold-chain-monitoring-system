import { Router } from "express";
import {
  incidentAcknowledgeSchema,
  incidentAssignSchema,
  incidentNoteSchema,
  incidentResolveSchema,
  PERMISSIONS,
} from "@frostguard/shared";
import { authenticate, requirePermission } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ok, paginated } from "../../lib/http";
import * as service from "./incidents.service";

export const incidentsRouter: Router = Router();
incidentsRouter.use(authenticate);

incidentsRouter.get("/", requirePermission(PERMISSIONS.INCIDENT_READ), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const result = await service.listIncidents({
      orgId: req.auth!.orgId,
      page,
      pageSize,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      severity: typeof req.query.severity === "string" ? req.query.severity : undefined,
      assigneeId: req.query.assigneeId === "me" ? req.auth!.userId : typeof req.query.assigneeId === "string" ? req.query.assigneeId : undefined,
      search: typeof req.query.search === "string" ? req.query.search : undefined,
    });
    return paginated(res, result.items, result.total, page, pageSize);
  } catch (err) {
    next(err);
  }
});

incidentsRouter.get("/stats", requirePermission(PERMISSIONS.INCIDENT_READ), async (req, res, next) => {
  try {
    return ok(res, await service.getIncidentStats(req.auth!.orgId));
  } catch (err) {
    next(err);
  }
});

incidentsRouter.get("/:id", requirePermission(PERMISSIONS.INCIDENT_READ), async (req, res, next) => {
  try {
    return ok(res, await service.getIncident(req.auth!.orgId, String(req.params.id)));
  } catch (err) {
    next(err);
  }
});

incidentsRouter.post(
  "/:id/acknowledge",
  requirePermission(PERMISSIONS.INCIDENT_WRITE),
  validate(incidentAcknowledgeSchema),
  async (req, res, next) => {
    try {
      return ok(res, await service.acknowledgeIncident(req.auth!.orgId, req.auth!.userId, String(req.params.id), req.body.notes, res.locals.requestId));
    } catch (err) {
      next(err);
    }
  }
);

incidentsRouter.post(
  "/:id/assign",
  requirePermission(PERMISSIONS.INCIDENT_WRITE),
  validate(incidentAssignSchema),
  async (req, res, next) => {
    try {
      return ok(res, await service.assignIncident(req.auth!.orgId, req.auth!.userId, String(req.params.id), req.body.assigneeId, res.locals.requestId));
    } catch (err) {
      next(err);
    }
  }
);

incidentsRouter.post(
  "/:id/investigate",
  requirePermission(PERMISSIONS.INCIDENT_WRITE),
  validate(incidentAcknowledgeSchema),
  async (req, res, next) => {
    try {
      return ok(res, await service.startInvestigation(req.auth!.orgId, req.auth!.userId, String(req.params.id), req.body.notes, res.locals.requestId));
    } catch (err) {
      next(err);
    }
  }
);

incidentsRouter.post(
  "/:id/resolve",
  requirePermission(PERMISSIONS.INCIDENT_RESOLVE),
  validate(incidentResolveSchema),
  async (req, res, next) => {
    try {
      return ok(res, await service.resolveIncident(req.auth!.orgId, req.auth!.userId, String(req.params.id), req.body, res.locals.requestId));
    } catch (err) {
      next(err);
    }
  }
);

incidentsRouter.post(
  "/:id/notes",
  requirePermission(PERMISSIONS.INCIDENT_WRITE),
  validate(incidentNoteSchema),
  async (req, res, next) => {
    try {
      return res.status(201).json({
        success: true,
        data: await service.addIncidentNote(req.auth!.orgId, req.auth!.userId, String(req.params.id), req.body.notes, res.locals.requestId),
      });
    } catch (err) {
      next(err);
    }
  }
);
