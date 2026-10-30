import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ok } from "../../lib/http";

export const healthRouter: Router = Router();

healthRouter.get("/live", (_req, res) => {
  return ok(res, {
    status: "ok",
    service: "frostguard-api",
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

healthRouter.get("/ready", async (_req, res, next) => {
  try {
    const started = Date.now();
    await prisma.$queryRaw(Prisma.sql`SELECT 1 AS ok`);
    const [pendingOutbox, openIncidents] = await Promise.all([
      prisma.outboxEvent.count({ where: { status: "PENDING" } }),
      prisma.incident.count({ where: { status: { in: ["OPEN", "ACKNOWLEDGED", "INVESTIGATING"] } } }),
    ]);
    return ok(res, {
      status: "ok",
      database: { reachable: true, latencyMs: Date.now() - started },
      outbox: { pending: pendingOutbox },
      incidents: { active: openIncidents },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});
