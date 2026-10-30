import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app, bearer, login, MERIDIAN, NORTHLINE, type LoginResult } from "./helpers";
import { prisma } from "../src/lib/prisma";

let northline: LoginResult;
let meridian: LoginResult;
let ids: {
  product: string;
  batch: string;
  warehouse: string;
  storageUnit: string;
  sensor: string;
  foreignBatch: string;
  foreignWarehouse: string;
  shipment: string;
  incident: string;
  alert: string;
};

beforeAll(async () => {
  [northline, meridian] = await Promise.all([login(NORTHLINE.owner), login(MERIDIAN.owner)]);
  const orgId = northline.user.organization.id;
  const [product, batch, warehouse, storageUnit, sensor, shipment, incident, alert, foreignBatch, foreignWarehouse] = await Promise.all([
    prisma.product.findFirstOrThrow({ where: { orgId } }),
    prisma.batch.findFirstOrThrow({ where: { orgId } }),
    prisma.warehouse.findFirstOrThrow({ where: { orgId } }),
    prisma.storageUnit.findFirstOrThrow({ where: { orgId } }),
    prisma.sensor.findFirstOrThrow({ where: { orgId } }),
    prisma.shipment.findFirstOrThrow({ where: { orgId } }),
    prisma.incident.findFirstOrThrow({ where: { orgId } }),
    prisma.alert.findFirstOrThrow({ where: { orgId } }),
    prisma.batch.findFirstOrThrow({ where: { orgId: meridian.user.organization.id } }),
    prisma.warehouse.findFirstOrThrow({ where: { orgId: meridian.user.organization.id } }),
  ]);
  ids = {
    product: product.id,
    batch: batch.id,
    warehouse: warehouse.id,
    storageUnit: storageUnit.id,
    sensor: sensor.id,
    shipment: shipment.id,
    incident: incident.id,
    alert: alert.id,
    foreignBatch: foreignBatch.id,
    foreignWarehouse: foreignWarehouse.id,
  };
});

const otherTenant = () => bearer(meridian.token);

describe("cross-tenant object authorization", () => {
  it("returns indistinguishable not-found responses for direct resource identifier substitution", async () => {
    const paths = [
      `/api/v1/products/${ids.product}`,
      `/api/v1/batches/${ids.batch}`,
      `/api/v1/batches/${ids.batch}/traceability`,
      `/api/v1/warehouses/${ids.warehouse}`,
      `/api/v1/storage-units/${ids.storageUnit}`,
      `/api/v1/devices/${ids.sensor}`,
      `/api/v1/shipments/${ids.shipment}`,
      `/api/v1/incidents/${ids.incident}`,
    ];
    const responses = await Promise.all(paths.map((path) => request(app).get(path).set(otherTenant())));
    expect(responses.map((res) => [res.status, res.body.error?.code])).toEqual(
      paths.map(() => [404, "NOT_FOUND"])
    );
  });

  it("does not mutate or delete another tenant's resources through substituted IDs", async () => {
    const before = await Promise.all([
      prisma.product.findUniqueOrThrow({ where: { id: ids.product } }),
      prisma.batch.findUniqueOrThrow({ where: { id: ids.batch } }),
      prisma.warehouse.findUniqueOrThrow({ where: { id: ids.warehouse } }),
      prisma.storageUnit.findUniqueOrThrow({ where: { id: ids.storageUnit } }),
      prisma.sensor.findUniqueOrThrow({ where: { id: ids.sensor } }),
    ]);
    const responses = await Promise.all([
      request(app).patch(`/api/v1/products/${ids.product}`).set(otherTenant()).send({ name: "Unauthorized edit" }),
      request(app).delete(`/api/v1/products/${ids.product}`).set(otherTenant()),
      request(app).patch(`/api/v1/batches/${ids.batch}`).set(otherTenant()).send({ status: "QUARANTINE" }),
      request(app).patch(`/api/v1/warehouses/${ids.warehouse}`).set(otherTenant()).send({ name: "Unauthorized edit" }),
      request(app).patch(`/api/v1/storage-units/${ids.storageUnit}`).set(otherTenant()).send({ name: "Unauthorized edit" }),
      request(app).patch(`/api/v1/devices/${ids.sensor}`).set(otherTenant()).send({ status: "REVOKED" }),
      request(app).post(`/api/v1/devices/${ids.sensor}/rotate-key`).set(otherTenant()),
      request(app).post(`/api/v1/devices/${ids.sensor}/revoke`).set(otherTenant()),
      request(app).post(`/api/v1/simulations/devices/${ids.sensor}/start`).set(otherTenant()).send({ scenario: "STABLE", intervalMs: 500 }),
      request(app).post(`/api/v1/simulations/devices/${ids.sensor}/stop`).set(otherTenant()),
      request(app).post(`/api/v1/simulations/devices/${ids.sensor}/reset`).set(otherTenant()),
      request(app).post(`/api/v1/shipments/${ids.shipment}/cancel`).set(otherTenant()),
      request(app).post(`/api/v1/shipments/${ids.shipment}/dispatch`).set(otherTenant()),
      request(app).post(`/api/v1/incidents/${ids.incident}/notes`).set(otherTenant()).send({ notes: "Unauthorized note" }),
      request(app).post(`/api/v1/alerts/${ids.alert}/acknowledge`).set(otherTenant()),
    ]);
    expect(responses.every((res) => res.status === 404)).toBe(true);
    const [product, batch, warehouse, storageUnit, sensor] = await Promise.all([
      prisma.product.findUniqueOrThrow({ where: { id: ids.product } }),
      prisma.batch.findUniqueOrThrow({ where: { id: ids.batch } }),
      prisma.warehouse.findUniqueOrThrow({ where: { id: ids.warehouse } }),
      prisma.storageUnit.findUniqueOrThrow({ where: { id: ids.storageUnit } }),
      prisma.sensor.findUniqueOrThrow({ where: { id: ids.sensor } }),
    ]);
    expect(product).toEqual(before[0]);
    expect(batch).toEqual(before[1]);
    expect(warehouse).toEqual(before[2]);
    expect(storageUnit).toEqual(before[3]);
    expect(sensor).toEqual(before[4]);
  });

  it("rejects foreign batches and warehouses in shipment creation without creating a record", async () => {
    const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { orgId: northline.user.organization.id } });
    const batch = await prisma.batch.findFirstOrThrow({
      where: { orgId: northline.user.organization.id, remainingQuantity: { gte: 1 }, status: { in: ["AVAILABLE", "RESERVED"] }, expiresAt: { gt: new Date() } },
    });
    const cases = [
      { originWarehouseId: warehouse.id, batchId: ids.foreignBatch, destinationName: "Foreign batch reference" },
      { originWarehouseId: ids.foreignWarehouse, batchId: batch.id, destinationName: "Foreign warehouse reference" },
    ];
    for (const input of cases) {
      const response = await request(app)
        .post("/api/v1/shipments")
        .set(bearer(northline.token))
        .send({
          originWarehouseId: input.originWarehouseId,
          destinationName: input.destinationName,
          destinationCity: "Pune",
          destinationLat: 18.5,
          destinationLng: 73.8,
          items: [{ batchId: input.batchId, quantity: 1 }],
        });
      expect(response.status).toBe(400);
      expect(await prisma.shipment.count({ where: { orgId: northline.user.organization.id, destinationName: input.destinationName } })).toBe(0);
    }
  });

  it("scopes nested telemetry, reports, search, list filters, and audit results", async () => {
    const batchNumber = (await prisma.batch.findUniqueOrThrow({ where: { id: ids.batch } })).batchNumber;
    const requests = [
      request(app).get(`/api/v1/telemetry/series?sensorId=${ids.sensor}`).set(otherTenant()),
      request(app).get(`/api/v1/reports/batch/${ids.batch}`).set(otherTenant()),
      request(app).get(`/api/v1/batches?search=${encodeURIComponent(batchNumber)}`).set(otherTenant()),
      request(app).get(`/api/v1/telemetry/readings?sensorId=${ids.sensor}`).set(otherTenant()),
      request(app).get("/api/v1/audit-logs?entityType=shipment&pageSize=100").set(otherTenant()),
    ];
    const [series, report, search, readings, audit] = await Promise.all(requests);
    expect(series.status).toBe(404);
    expect(report.status).toBe(404);
    expect(search.status).toBe(200);
    expect(search.body.meta.total).toBe(0);
    expect(readings.status).toBe(200);
    expect(readings.body.meta.total).toBe(0);
    expect(audit.status).toBe(200);
    expect(audit.body.data.some((row: { entityId: string }) => row.entityId === ids.shipment)).toBe(false);
  });

  it("does not reveal another tenant's user membership through role or removal endpoints", async () => {
    const responses = await Promise.all([
      request(app).patch(`/api/v1/users/${northline.user.id}/role`).set(otherTenant()).send({ roleKey: "viewer" }),
      request(app).delete(`/api/v1/users/${northline.user.id}`).set(otherTenant()),
    ]);
    expect(responses.map((res) => [res.status, res.body.error?.code])).toEqual([
      [404, "NOT_FOUND"],
      [404, "NOT_FOUND"],
    ]);
    const members = await request(app).get("/api/v1/users/assignable").set(otherTenant());
    expect(members.status).toBe(200);
    expect(members.body.data.some((member: { id: string }) => member.id === northline.user.id)).toBe(false);
  });
});
