import type { Server as HttpServer } from "node:http";
import { Server as SocketServer } from "socket.io";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { verifyAccessToken } from "../security/tokens";
import { logger } from "../lib/logger";

let io: SocketServer | null = null;

function accessTokenFromHandshake(handshake: {
  auth?: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
}): string | null {
  const authToken = handshake.auth?.token;
  if (typeof authToken === "string" && authToken.length > 0) return authToken;

  const header = handshake.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) return header.slice(7).trim();

  const cookieHeader = handshake.headers.cookie;
  if (typeof cookieHeader === "string") {
    const match = cookieHeader.split(";").map((c) => c.trim()).find((c) => c.startsWith("fg_access="));
    if (match) return decodeURIComponent(match.slice("fg_access=".length));
  }
  return null;
}

/**
 * Socket.IO connections are authenticated with the same access token as REST.
 * Membership is revalidated against the database so a revoked user cannot
 * keep receiving telemetry on an already-open websocket.
 */
export function initRealtime(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    path: "/socket.io",
    cors: { origin: env.corsOrigins, credentials: true },
    serveClient: false,
  });

  io.use(async (socket, next) => {
    try {
      const token = accessTokenFromHandshake(socket.handshake);
      const claims = token ? verifyAccessToken(token) : null;
      if (!claims) return next(new Error("UNAUTHORIZED"));

      const membership = await prisma.membership.findUnique({
        where: { orgId_userId: { orgId: claims.org, userId: claims.sub } },
        include: { user: { select: { isActive: true } } },
      });
      if (!membership || !membership.user.isActive) return next(new Error("UNAUTHORIZED"));

      socket.data.orgId = claims.org;
      socket.data.userId = claims.sub;
      next();
    } catch (err) {
      logger.warn({ err }, "Socket authentication error");
      next(new Error("UNAUTHORIZED"));
    }
  });

  io.on("connection", (socket) => {
    const orgId = socket.data.orgId as string;
    void socket.join(`org:${orgId}`);
    socket.emit("realtime:connected", {
      orgId,
      connectedAt: new Date().toISOString(),
    });
  });

  return io;
}

/** Called by the outbox worker only after the producing transaction commits. */
export function publishToOrg(orgId: string | null, topic: string, payload: unknown): void {
  if (!io) return;
  if (orgId) io.to(`org:${orgId}`).emit(topic, payload);
  else io.emit(topic, payload);
}

export function getRealtimeServer(): SocketServer | null {
  return io;
}

export async function closeRealtime(): Promise<void> {
  if (!io) return;
  await io.close();
  io = null;
}
