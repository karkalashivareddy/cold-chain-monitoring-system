import fs from "node:fs";
import path from "node:path";
import express from "express";
import type { Express } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { requestContext, csrfGuard, globalLimiter } from "./middleware/security";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { healthRouter } from "./modules/health/health.routes";
import { authRouter } from "./modules/auth/auth.routes";
import { productsRouter } from "./modules/products/products.routes";
import { batchesRouter } from "./modules/batches/batches.routes";
import { warehousesRouter } from "./modules/warehouses/warehouses.routes";
import { storageUnitsRouter } from "./modules/storage-units/storage-units.routes";
import { devicesRouter } from "./modules/devices/devices.routes";
import { telemetryRouter } from "./modules/telemetry/telemetry.routes";
import { simulationsRouter } from "./modules/simulations/simulations.routes";
import { shipmentsRouter } from "./modules/shipments/shipments.routes";
import { alertsRouter } from "./modules/alerts/alerts.routes";
import { incidentsRouter } from "./modules/incidents/incidents.routes";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes";
import { analyticsRouter } from "./modules/analytics/analytics.routes";
import { auditRouter } from "./modules/audit/audit.routes";
import { usersRouter } from "./modules/users/users.routes";
import { reportsRouter } from "./modules/reports/reports.routes";
import { dbmsRouter } from "./modules/dbms/dbms.routes";

export function createApp(): Express {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: [
            "'self'",
            "data:",
            "https://tile.openstreetmap.org",
            "https://*.tile.openstreetmap.org",
            "https://unpkg.com",
          ],
          connectSrc: ["'self'", "https://tile.openstreetmap.org", "https://*.tile.openstreetmap.org"],
          fontSrc: ["'self'", "data:"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
    })
  );

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
        return callback(new Error("Origin not allowed by CORS"));
      },
      credentials: true,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "x-device-key", "x-request-id", "x-frostguard-csrf"],
      exposedHeaders: ["x-request-id", "RateLimit", "RateLimit-Policy"],
      maxAge: 600,
    })
  );

  app.use(requestContext);
  app.use(
    pinoHttp({
      logger: logger as never,
      genReqId: (_req, res) => res.locals.requestId as string,
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
      autoLogging: {
        ignore: (req) => req.url === "/health/live" || req.url === "/health/ready",
      },
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(csrfGuard);
  app.use(globalLimiter);

  app.use("/health", healthRouter);

  const api = express.Router();
  api.get("/", (_req, res) => {
    res.json({
      success: true,
      data: {
        name: "FROSTGUARD API",
        version: "1.0.0",
        documentation: "/api/v1/docs",
        time: new Date().toISOString(),
      },
    });
  });
  api.use("/auth", authRouter);
  api.use("/products", productsRouter);
  api.use("/batches", batchesRouter);
  api.use("/warehouses", warehousesRouter);
  api.use("/storage-units", storageUnitsRouter);
  api.use("/devices", devicesRouter);
  api.use("/telemetry", telemetryRouter);
  api.use("/simulations", simulationsRouter);
  api.use("/shipments", shipmentsRouter);
  api.use("/alerts", alertsRouter);
  api.use("/incidents", incidentsRouter);
  api.use("/dashboard", dashboardRouter);
  api.use("/analytics", analyticsRouter);
  api.use("/audit-logs", auditRouter);
  api.use("/users", usersRouter);
  api.use("/reports", reportsRouter);
  api.use("/dbms", dbmsRouter);
  api.use("/health", healthRouter);
  app.use("/api/v1", api);
  app.use("/api", notFoundHandler);

  // In production the API can serve the built SPA from the same origin,
  // removing cross-site cookie complexity entirely.
  const webDist = path.resolve(__dirname, "../../web/dist");
  const indexPath = path.join(webDist, "index.html");
  if (fs.existsSync(indexPath)) {
    app.use(express.static(webDist, { index: false, maxAge: "1h" }));
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/socket.io")) return next();
      return res.sendFile(indexPath);
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
