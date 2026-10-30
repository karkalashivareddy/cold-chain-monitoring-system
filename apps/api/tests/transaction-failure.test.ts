import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import mysql from "mysql2/promise";
import { app, bearer, login, NORTHLINE } from "./helpers";
import { prisma } from "../src/lib/prisma";

const OUTBOX_FAILURE_TRIGGER = "fg_test_fail_outbox_insert";
let token: string;
let orgId: string;
let actorId: string;

beforeAll(async () => {
  const session = await login(NORTHLINE.manager);
  token = session.token;
  orgId = session.user.organization.id;
  actorId = session.user.id;
});

async function withOutboxInsertFailure<T>(run: () => Promise<T>): Promise<T> {
  // Prisma uses prepared statements for raw queries; MySQL does not permit DDL
  // such as CREATE TRIGGER through that protocol. Use a direct test-only
  // connection to the disposable frostguard_test schema for fixture setup.
  const connection = await mysql.createConnection("mysql://root:root@localhost:3306/frostguard_test");
  try {
    await connection.query(`DROP TRIGGER IF EXISTS ${OUTBOX_FAILURE_TRIGGER}`);
    await connection.query(
      `CREATE TRIGGER ${OUTBOX_FAILURE_TRIGGER} BEFORE INSERT ON outbox_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'FROSTGUARD_TEST_OUTBOX_FAILURE'`
    );
    return await run();
  } finally {
    await connection.query(`DROP TRIGGER IF EXISTS ${OUTBOX_FAILURE_TRIGGER}`);
    await connection.end();
  }
}

describe("transaction rollback when required outbox persistence fails", () => {
  it("rolls back telemetry, device state, audit, and outbox when the final event write fails", async () => {
    const sensor = await prisma.sensor.findFirstOrThrow({ where: { orgId, deviceId: "FGS-HYD-C1A" } });
    const latest = await prisma.sensorReading.findFirst({
      where: { sensorId: sensor.id },
      orderBy: { sequenceNumber: "desc" },
      select: { sequenceNumber: true },
    });
    const sequenceNumber = (latest?.sequenceNumber ?? 1000) + 1;
    const beforeLastSeen = sensor.lastSeenAt;
    const beforeAudit = await prisma.auditLog.count({ where: { orgId, action: "telemetry.ingested", entityId: sensor.id } });
    const beforeEvents = await prisma.outboxEvent.count({ where: { orgId, topic: "sensor:reading" } });

    const response = await withOutboxInsertFailure(() =>
      request(app)
        .post("/api/v1/telemetry/readings")
        .set("x-device-key", "fgd_demo_fgs-hyd-c1a_2026")
        .send({
          deviceId: sensor.deviceId,
          temperature: 4.4,
          humidity: 48,
          recordedAt: new Date().toISOString(),
          sequenceNumber,
        })
    );

    expect(response.status).toBe(500);
    expect(await prisma.sensorReading.count({ where: { sensorId: sensor.id, sequenceNumber } })).toBe(0);
    expect((await prisma.sensor.findUniqueOrThrow({ where: { id: sensor.id } })).lastSeenAt).toEqual(beforeLastSeen);
    expect(await prisma.auditLog.count({ where: { orgId, action: "telemetry.ingested", entityId: sensor.id } })).toBe(beforeAudit);
    expect(await prisma.outboxEvent.count({ where: { orgId, topic: "sensor:reading" } })).toBe(beforeEvents);
    const retry = await request(app)
      .post("/api/v1/telemetry/readings")
      .set("x-device-key", "fgd_demo_fgs-hyd-c1a_2026")
      .send({ deviceId: sensor.deviceId, temperature: 4.4, humidity: 48, recordedAt: new Date().toISOString(), sequenceNumber });
    expect(retry.status).toBe(201);
    expect(retry.body.data.duplicate).toBe(false);
  });

  it("rolls back shipment state and stock after reservation when outbox insertion fails", async () => {
    const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { orgId } });
    const batch = await prisma.batch.findFirstOrThrow({
      where: { orgId, status: { in: ["AVAILABLE", "RESERVED"] }, expiresAt: { gt: new Date() }, remainingQuantity: { gte: 2 } },
      orderBy: { remainingQuantity: "desc" },
    });
    const created = await request(app)
      .post("/api/v1/shipments")
      .set(bearer(token))
      .send({
        originWarehouseId: warehouse.id,
        destinationName: `Rollback dispatch ${Date.now()}`,
        destinationCity: "Hyderabad",
        destinationLat: 17.4,
        destinationLng: 78.5,
        items: [{ batchId: batch.id, quantity: 1 }],
      });
    expect(created.status).toBe(201);
    const shipmentId = created.body.data.id as string;
    const beforeStock = (await prisma.batch.findUniqueOrThrow({ where: { id: batch.id } })).remainingQuantity;

    const response = await withOutboxInsertFailure(() =>
      request(app).post(`/api/v1/shipments/${shipmentId}/dispatch`).set(bearer(token))
    );
    expect(response.status).toBe(500);
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } })).status).toBe("PLANNED");
    expect((await prisma.batch.findUniqueOrThrow({ where: { id: batch.id } })).remainingQuantity).toBe(beforeStock);
    expect(await prisma.shipmentEvent.count({ where: { shipmentId, type: "DISPATCHED" } })).toBe(0);
  });

  it("rolls back incident disposition and action when outbox insertion fails", async () => {
    const incident = await prisma.incident.create({
      data: {
        orgId,
        code: `ROLLBACK-${Date.now()}`,
        title: "Injected transaction rollback test",
        description: "Test-only incident record on the disposable integration schema.",
        severity: "WARNING",
        status: "INVESTIGATING",
        createdById: actorId,
      },
    });
    const beforeOutbox = await prisma.outboxEvent.count({ where: { orgId, topic: "incident:updated" } });
    const response = await withOutboxInsertFailure(() =>
      request(app)
        .post(`/api/v1/incidents/${incident.id}/resolve`)
        .set(bearer(token))
        .send({ resolutionNotes: "Test disposition reviewed and documented for rollback verification.", outcome: "PRODUCT_SAFE" })
    );
    expect(response.status).toBe(500);
    expect((await prisma.incident.findUniqueOrThrow({ where: { id: incident.id } })).status).toBe("INVESTIGATING");
    expect(await prisma.incidentAction.count({ where: { incidentId: incident.id, action: "RESOLVED" } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { orgId, entityType: "incident", entityId: incident.id, action: "incident.resolved" } })).toBe(0);
    expect(await prisma.outboxEvent.count({ where: { orgId, topic: "incident:updated" } })).toBe(beforeOutbox);
  });

  it("rolls back shipment creation if its initial outbox write fails", async () => {
    const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { orgId } });
    const product = await prisma.product.findFirstOrThrow({ where: { orgId, isActive: true } });
    const batch = await prisma.batch.create({
      data: {
        orgId,
        productId: product.id,
        batchNumber: `ROLLBACK-CREATE-${Date.now()}`,
        manufacturedAt: new Date(Date.now() - 86_400_000),
        expiresAt: new Date(Date.now() + 86_400_000 * 365),
        quantity: 5,
        remainingQuantity: 5,
        status: "AVAILABLE",
      },
    });
    const destinationName = `Rollback create ${Date.now()}`;
    const response = await withOutboxInsertFailure(() =>
      request(app)
        .post("/api/v1/shipments")
        .set(bearer(token))
        .send({
          originWarehouseId: warehouse.id,
          destinationName,
          destinationCity: "Hyderabad",
          destinationLat: 17.4,
          destinationLng: 78.5,
          items: [{ batchId: batch.id, quantity: 1 }],
        })
    );
    expect(response.status).toBe(500);
    expect(await prisma.shipment.count({ where: { orgId, destinationName } })).toBe(0);
  });
});
