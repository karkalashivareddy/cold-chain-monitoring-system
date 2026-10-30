import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { io as connectSocket, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import { closeRealtime, initRealtime, publishToOrg } from "../src/realtime/socket";
import { app, login, MERIDIAN, NORTHLINE } from "./helpers";

let server: HttpServer;
let baseUrl: string;
let northlineManager: Awaited<ReturnType<typeof login>>;
let northlineViewer: Awaited<ReturnType<typeof login>>;
let meridianOwner: Awaited<ReturnType<typeof login>>;
const sockets: Socket[] = [];

async function openSocket(token: string) {
  const socket = connectSocket(baseUrl, {
    path: "/socket.io",
    transports: ["websocket"],
    auth: { token },
    forceNew: true,
    reconnection: false,
    timeout: 5_000,
  });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });
  return socket;
}

function nextPayload<T = Record<string, unknown>>(socket: Socket, topic: string) {
  return new Promise<T>((resolve) => socket.once(topic, resolve));
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

beforeAll(async () => {
  [northlineManager, northlineViewer, meridianOwner] = await Promise.all([
    login(NORTHLINE.manager),
    login(NORTHLINE.viewer),
    login(MERIDIAN.owner),
  ]);
  server = createServer(app);
  initRealtime(server, { revalidateEveryMs: 100 });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const socket of sockets) socket.disconnect();
  await closeRealtime();
  if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("Socket.IO organization and permission rooms", () => {
  it("delivers each topic only to same-organization members with its read permission", async () => {
    const manager = await openSocket(northlineManager.token);
    const viewer = await openSocket(northlineViewer.token);
    const otherTenant = await openSocket(meridianOwner.token);

    const managerShipment = nextPayload(manager, "shipment:updated");
    const viewerShipment = nextPayload(viewer, "shipment:updated");
    const foreignShipment = nextPayload(otherTenant, "shipment:updated");
    expect(
      publishToOrg(northlineManager.user.organization.id, "shipment:updated", { shipmentId: "shipment-a" }, "evt-a")
    ).toBe(true);
    await expect(managerShipment).resolves.toMatchObject({ shipmentId: "shipment-a", eventId: "evt-a" });
    await expect(viewerShipment).resolves.toMatchObject({ shipmentId: "shipment-a", eventId: "evt-a" });
    let foreignReceived = false;
    void foreignShipment.then(() => (foreignReceived = true));
    await delay(100);
    expect(foreignReceived).toBe(false);

    const managerReading = nextPayload(manager, "sensor:reading");
    let viewerReceivedReading = false;
    viewer.once("sensor:reading", () => (viewerReceivedReading = true));
    publishToOrg(northlineManager.user.organization.id, "sensor:reading", { temperature: 5.1 }, "evt-reading");
    await expect(managerReading).resolves.toMatchObject({ temperature: 5.1, eventId: "evt-reading" });
    await delay(100);
    expect(viewerReceivedReading).toBe(false);

    // No client-controlled organization subscription is registered.
    otherTenant.emit("subscribe", { orgId: northlineManager.user.organization.id });
    const northlineIncident = nextPayload(manager, "incident:updated");
    let foreignIncidentReceived = false;
    otherTenant.once("incident:updated", () => (foreignIncidentReceived = true));
    publishToOrg(northlineManager.user.organization.id, "incident:updated", { incidentId: "incident-a" }, "evt-i");
    await expect(northlineIncident).resolves.toMatchObject({ incidentId: "incident-a" });
    await delay(100);
    expect(foreignIncidentReceived).toBe(false);
  });

  it("disconnects an established socket when its role permissions change", async () => {
    const viewer = await openSocket(northlineViewer.token);
    const userId = northlineViewer.user.id;
    const orgId = northlineViewer.user.organization.id;
    const membership = await prisma.membership.findUniqueOrThrow({
      where: { orgId_userId: { orgId, userId } },
    });
    const ownerRole = await prisma.role.findUniqueOrThrow({ where: { key: "owner" } });
    try {
      const disconnected = new Promise<string>((resolve) => viewer.once("disconnect", resolve));
      await prisma.membership.update({
        where: { orgId_userId: { orgId, userId } },
        data: { roleId: ownerRole.id },
      });
      await expect(disconnected).resolves.toBe("io server disconnect");
    } finally {
      await prisma.membership.update({
        where: { orgId_userId: { orgId, userId } },
        data: { roleId: membership.roleId },
      });
    }
  });

  it("rejects missing or invalid authentication", async () => {
    const unauthorized = connectSocket(baseUrl, {
      path: "/socket.io",
      transports: ["websocket"],
      auth: { token: "not-a-valid-token" },
      forceNew: true,
      reconnection: false,
    });
    await expect(
      new Promise<void>((resolve, reject) => {
        unauthorized.once("connect", resolve);
        unauthorized.once("connect_error", reject);
      })
    ).rejects.toThrow("UNAUTHORIZED");
    unauthorized.disconnect();
  });
});
