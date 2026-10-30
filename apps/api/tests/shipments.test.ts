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
