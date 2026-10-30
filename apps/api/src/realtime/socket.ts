import type { Server as HttpServer } from "node:http";
import { Server as SocketServer } from "socket.io";
import { PERMISSIONS } from "@frostguard/shared";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { verifyAccessToken } from "../security/tokens";
import { logger } from "../lib/logger";

let io: SocketServer | null = null;
const SOCKET_REVALIDATE_MS = 30_000;

const TOPIC_PERMISSION: Record<string, string> = {
  "sensor:reading": PERMISSIONS.TELEMETRY_READ,
  "excursion:updated": PERMISSIONS.TELEMETRY_READ,
  "incident:created": PERMISSIONS.INCIDENT_READ,
  "incident:updated": PERMISSIONS.INCIDENT_READ,
  "alert:created": PERMISSIONS.INCIDENT_READ,
  "alert:updated": PERMISSIONS.INCIDENT_READ,
  "shipment:updated": PERMISSIONS.SHIPMENT_READ,
  "batch:created": PERMISSIONS.BATCH_READ,
  "product:created": PERMISSIONS.PRODUCT_READ,
};

const permissionRoom = (orgId: string, permission: string) => `org:${orgId}:permission:${permission}`;

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
export function initRealtime(
  httpServer: HttpServer,
  options: { revalidateEveryMs?: number } = {}
): SocketServer {
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
        include: {
          user: { select: { isActive: true } },
          role: { include: { permissions: { include: { permission: { select: { key: true } } } } } },
        },
      });
      if (!membership || !membership.user.isActive) return next(new Error("UNAUTHORIZED"));

      socket.data.orgId = claims.org;
      socket.data.userId = claims.sub;
      socket.data.permissionKeys = membership.role.permissions.map((rp) => rp.permission.key).sort();
      next();
    } catch (err) {
      logger.warn({ err }, "Socket authentication error");
      next(new Error("UNAUTHORIZED"));
    }
  });

  io.on("connection", (socket) => {
    const orgId = socket.data.orgId as string;
    const permissionKeys = socket.data.permissionKeys as string[];
    for (const permission of permissionKeys) void socket.join(permissionRoom(orgId, permission));
    socket.emit("realtime:connected", {
      orgId,
      connectedAt: new Date().toISOString(),
    });

    let checking = false;
    const authTimer = setInterval(() => {
      if (checking) return;
      checking = true;
      void (async () => {
        try {
          const membership = await prisma.membership.findUnique({
            where: { orgId_userId: { orgId, userId: socket.data.userId as string } },
            include: {
              user: { select: { isActive: true } },
              role: { include: { permissions: { include: { permission: { select: { key: true } } } } } },
            },
          });
          const current = membership?.role.permissions.map((rp) => rp.permission.key).sort() ?? [];
          if (!membership || !membership.user.isActive || current.join("\0") !== permissionKeys.join("\0")) {
            socket.disconnect(true);
          }
        } catch (err) {
          logger.warn({ err, userId: socket.data.userId }, "Socket membership revalidation failed; disconnecting");
          socket.disconnect(true);
        } finally {
          checking = false;
        }
      })();
    }, options.revalidateEveryMs ?? SOCKET_REVALIDATE_MS);
    socket.on("disconnect", () => clearInterval(authTimer));
  });

  return io;
}

/** Called by the outbox worker only after the producing transaction commits. */
export function publishToOrg(orgId: string | null, topic: string, payload: unknown, eventId?: string): boolean {
  const permission = TOPIC_PERMISSION[topic];
  if (!io || !orgId || !permission) return false;
  const eventPayload = eventId
    ? payload && typeof payload === "object" && !Array.isArray(payload)
      ? { ...payload, eventId }
      : { eventId, data: payload }
    : payload;
  io.to(permissionRoom(orgId, permission)).emit(topic, eventPayload);
  return true;
}

export function getRealtimeServer(): SocketServer | null {
  return io;
}

export async function closeRealtime(): Promise<void> {
  if (!io) return;
  await io.close();
  io = null;
}
