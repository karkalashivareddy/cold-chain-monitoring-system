import { describe, expect, it, beforeAll } from "vitest";
import request from "supertest";
import { app, bearer, login, NORTHLINE } from "./helpers";
import { prisma } from "../src/lib/prisma";

let token: string;
let orgId: string;

beforeAll(async () => {
  const session = await login(NORTHLINE.owner);
  token = session.token;
  orgId = session.user.organization.id;
});

describe("shipment dispatch and stock reservation", () => {
  it("never treats a warehouse origin as a current GPS position", async () => {
    const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { orgId, latitude: { not: null }, longitude: { not: null } } });
    const batch = await prisma.batch.findFirstOrThrow({
      where: { orgId, status: { in: ["AVAILABLE", "RESERVED"] }, expiresAt: { gt: new Date() }, remainingQuantity: { gte: 1 } },
      orderBy: { remainingQuantity: "desc" },
    });
    const created = await request(app).post("/api/v1/shipments").set(bearer(token)).send({
      originWarehouseId: warehouse.id,
      destinationName: "Position Provenance Test Clinic",
      destinationLat: 19.08,
      destinationLng: 72.88,
      items: [{ batchId: batch.id, quantity: 1 }],
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.data.currentLat).toBeNull();
    expect(created.body.data.currentLng).toBeNull();
    expect(created.body.data.positionSource).toBe("UNAVAILABLE");

    let map = await request(app).get("/api/v1/shipments/map").set(bearer(token));
    let point = map.body.data.find((shipment: { id: string }) => shipment.id === created.body.data.id);
    expect(point.current).toBeNull();
    expect(point.positionSource).toBe("UNAVAILABLE");

    const dispatched = await request(app).post(`/api/v1/shipments/${created.body.data.id}/dispatch`).set(bearer(token));
    expect(dispatched.status).toBe(200);
    expect(dispatched.body.data.positionSource).toBe("UNAVAILABLE");
    map = await request(app).get("/api/v1/shipments/map").set(bearer(token));
    point = map.body.data.find((shipment: { id: string }) => shipment.id === created.body.data.id);
    expect(point.current).toBeNull();

    const checkpoint = await request(app).patch(`/api/v1/shipments/${created.body.data.id}/position`).set(bearer(token)).send({ lat: 18.52, lng: 73.86, progressPercent: 25 });
    expect(checkpoint.status).toBe(200);
    expect(checkpoint.body.data.positionSource).toBe("OPERATOR_REPORTED");
    expect(checkpoint.body.data.positionUpdatedAt).toBeTruthy();
    map = await request(app).get("/api/v1/shipments/map").set(bearer(token));
    point = map.body.data.find((shipment: { id: string }) => shipment.id === created.body.data.id);
    expect(point.current).toEqual({ lat: 18.52, lng: 73.86 });
    expect(point.positionSource).toBe("OPERATOR_REPORTED");
    expect(point.positionUpdatedAt).toBeTruthy();
  });

  it("dispatches a planned shipment and decrements the batch exactly once", async () => {
    const list = await request(app).get("/api/v1/shipments?search=SHP-2026-0001").set(bearer(token));
    const shipment = list.body.data[0] as { id: string; status: string };
    expect(shipment.status).toBe("PLANNED");

    const detail = await request(app).get(`/api/v1/shipments/${shipment.id}`).set(bearer(token));
    const item = detail.body.data.items[0] as { batchId: string; quantity: number };
    const before = await prisma.batch.findUniqueOrThrow({ where: { id: item.batchId } });

    const dispatched = await request(app)
      .post(`/api/v1/shipments/${shipment.id}/dispatch`)
      .set(bearer(token));
    expect(dispatched.status).toBe(200);
    expect(dispatched.body.data.status).toBe("DISPATCHED");
    expect(dispatched.body.data.dispatchedAt).toBeTruthy();

    const after = await prisma.batch.findUniqueOrThrow({ where: { id: item.batchId } });
    expect(after.remainingQuantity).toBe(before.remainingQuantity - item.quantity);
  });

  it("refuses to dispatch the same shipment twice", async () => {
    const list = await request(app).get("/api/v1/shipments?search=SHP-2026-0001").set(bearer(token));
    const shipment = list.body.data[0] as { id: string };

    const res = await request(app)
      .post(`/api/v1/shipments/${shipment.id}/dispatch`)
      .set(bearer(token));
    expect(res.status).toBe(409);
  });

  it("serializes two concurrent dispatches so exactly one succeeds", async () => {
    const warehouses = await request(app).get("/api/v1/warehouses").set(bearer(token));
    const warehouseId = warehouses.body.data[0].id as string;
    const batches = await request(app).get("/api/v1/batches?status=AVAILABLE&pageSize=50").set(bearer(token));
    const batch = batches.body.data.find((b: { remainingQuantity: number }) => b.remainingQuantity >= 120) as
      | { id: string; remainingQuantity: number }
      | undefined;
    expect(batch).toBeTruthy();
    const before = batch!.remainingQuantity;

    const created = await request(app)
      .post("/api/v1/shipments")
      .set(bearer(token))
      .send({
        originWarehouseId: warehouseId,
        destinationName: "Concurrency Test Hospital",
        destinationCity: "Hyderabad",
        destinationLat: 17.4,
        destinationLng: 78.5,
        items: [{ batchId: batch!.id, quantity: 60 }],
      });
    expect(created.status).toBe(201);
    const shipmentId = created.body.data.id as string;

    const [a, b] = await Promise.all([
      request(app).post(`/api/v1/shipments/${shipmentId}/dispatch`).set(bearer(token)),
      request(app).post(`/api/v1/shipments/${shipmentId}/dispatch`).set(bearer(token)),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);

    const after = await prisma.batch.findUniqueOrThrow({ where: { id: batch!.id } });
    expect(after.remainingQuantity).toBe(before - 60);
  });

  it("prevents two different shipments from reserving more than shared batch stock", async () => {
    const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { orgId } });
    const batch = await prisma.batch.findFirstOrThrow({
      where: {
        orgId,
        status: { in: ["AVAILABLE", "RESERVED"] },
        expiresAt: { gt: new Date() },
        remainingQuantity: { gte: 2 },
      },
      orderBy: { remainingQuantity: "desc" },
    });
    const before = batch.remainingQuantity;
    const quantity = Math.floor(before / 2) + 1;
    const payload = (destinationName: string) => ({
      originWarehouseId: warehouse.id,
      destinationName,
      destinationCity: "Hyderabad",
      destinationLat: 17.4,
      destinationLng: 78.5,
      items: [{ batchId: batch.id, quantity }],
    });
    const first = await request(app).post("/api/v1/shipments").set(bearer(token)).send(payload("Stock contention A"));
    const second = await request(app).post("/api/v1/shipments").set(bearer(token)).send(payload("Stock contention B"));
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const shipmentIds = [first.body.data.id as string, second.body.data.id as string];
    const results = await Promise.all(
      shipmentIds.map((id) => request(app).post(`/api/v1/shipments/${id}/dispatch`).set(bearer(token)))
    );
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);

    const after = await prisma.batch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(after.remainingQuantity).toBe(before - quantity);
    const persistedShipments = await prisma.shipment.findMany({
      where: { id: { in: shipmentIds } },
      select: { id: true, status: true },
    });
    expect(persistedShipments.filter((shipment) => shipment.status === "DISPATCHED")).toHaveLength(1);
    expect(persistedShipments.filter((shipment) => shipment.status === "PLANNED")).toHaveLength(1);
  });

  it("serializes cancellation against dispatch without losing reserved stock", async () => {
    const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { orgId } });
    const batch = await prisma.batch.findFirstOrThrow({
      where: {
        orgId,
        status: { in: ["AVAILABLE", "RESERVED"] },
        expiresAt: { gt: new Date() },
        remainingQuantity: { gte: 1 },
      },
      orderBy: { remainingQuantity: "desc" },
    });
    const quantity = 1;
    const before = batch.remainingQuantity;
    const created = await request(app)
      .post("/api/v1/shipments")
      .set(bearer(token))
      .send({
        originWarehouseId: warehouse.id,
        destinationName: "Cancel-dispatch race test",
        destinationCity: "Hyderabad",
        destinationLat: 17.4,
        destinationLng: 78.5,
        items: [{ batchId: batch.id, quantity }],
      });
    expect(created.status).toBe(201);
    const shipmentId = created.body.data.id as string;

    const [cancelled, dispatched] = await Promise.all([
      request(app).post(`/api/v1/shipments/${shipmentId}/cancel`).set(bearer(token)),
      request(app).post(`/api/v1/shipments/${shipmentId}/dispatch`).set(bearer(token)),
    ]);
    expect([cancelled.status, dispatched.status].sort()).toEqual([200, 409]);

    const [finalShipment, finalBatch] = await Promise.all([
      prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } }),
      prisma.batch.findUniqueOrThrow({ where: { id: batch.id } }),
    ]);
    if (finalShipment.status === "CANCELLED") expect(finalBatch.remainingQuantity).toBe(before);
    else {
      expect(finalShipment.status).toBe("DISPATCHED");
      expect(finalBatch.remainingQuantity).toBe(before - quantity);
    }
  });

  it("stores a shipment event and exposes it on the detail timeline", async () => {
    const list = await request(app).get("/api/v1/shipments?status=DISPATCHED").set(bearer(token));
    const shipmentId = list.body.data[0].id as string;

    const event = await request(app)
      .post(`/api/v1/shipments/${shipmentId}/events`)
      .set(bearer(token))
      .send({ type: "CHECKPOINT", message: "Automated integration checkpoint", lat: 17.5, lng: 78.6 });
    expect(event.status).toBe(201);

    const detail = await request(app).get(`/api/v1/shipments/${shipmentId}`).set(bearer(token));
    expect(detail.body.data.events.some((e: { message: string }) => e.message === "Automated integration checkpoint")).toBe(true);
  });
});
