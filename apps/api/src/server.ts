import http from "node:http";
import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { prisma } from "./lib/prisma";
import { initRealtime, closeRealtime } from "./realtime/socket";
import { startOutboxWorker, stopOutboxWorker } from "./services/outbox";
import { stopAllSimulations } from "./modules/simulations/simulations.service";

const app = createApp();
const server = http.createServer(app);
initRealtime(server);
startOutboxWorker();

server.listen(env.API_PORT, () => {
  logger.info(
    { port: env.API_PORT, environment: env.NODE_ENV, webOrigin: env.WEB_ORIGIN },
    "FROSTGUARD API listening"
  );
});

let shuttingDown = false;
async function shutdown(signal: string, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Graceful shutdown started");
  stopOutboxWorker();
  stopAllSimulations();
  await closeRealtime().catch(() => undefined);
  await new Promise<void>((resolve) => {
    const forceClose = setTimeout(() => {
      server.closeAllConnections();
      resolve();
    }, 10_000);
    forceClose.unref();
    server.close(() => {
      clearTimeout(forceClose);
      resolve();
    });
  });
  await prisma.$disconnect().catch(() => undefined);
  logger.info("Graceful shutdown complete");
  setTimeout(() => process.exit(exitCode), 250).unref();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception — exiting");
  void shutdown("uncaughtException", 1);
});
