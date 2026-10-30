import { describe, expect, it, beforeAll } from "vitest";
import request from "supertest";
import { app, bearer, login, MERIDIAN, NORTHLINE, type LoginResult } from "./helpers";

let northlineOwner: LoginResult;
let northlineViewer: LoginResult;
let northlineOperator: LoginResult;
let northlineAuditor: LoginResult;
let meridianOwner: LoginResult;
let northlineShipmentId: string;
let northlineProductId: string;
let northlineBatchId: string;
let meridianProfileId: string;
let northlineProfileId: string;
let northlineStorageUnitId: string;
let northlineSensorId: string;
let meridianSensorId: string;

beforeAll(async () => {
  [northlineOwner, northlineViewer, northlineOperator, northlineAuditor, meridianOwner] = await Promise.all([
    login(NORTHLINE.owner),
    login(NORTHLINE.viewer),
    login(NORTHLINE.operator),
    login(NORTHLINE.auditor),
    login(MERIDIAN.owner),
  ]);

  const shipments = await request(app).get("/api/v1/shipments").set(bearer(northlineOwner.token));
  northlineShipmentId = shipments.body.data[0].id as string;

  const { prisma } = await import("../src/lib/prisma");
  const [product, batch, profile, ownProfile, northlineStorageUnit, northlineSensor, meridianSensor] = await Promise.all([
    prisma.product.findFirstOrThrow({ where: { orgId: northlineOwner.user.organization.id } }),
    prisma.batch.findFirstOrThrow({ where: { orgId: northlineOwner.user.organization.id } }),
    prisma.temperatureProfile.findFirstOrThrow({ where: { orgId: meridianOwner.user.organization.id } }),
    prisma.temperatureProfile.findFirstOrThrow({ where: { orgId: northlineOwner.user.organization.id } }),
    prisma.storageUnit.findFirstOrThrow({ where: { orgId: northlineOwner.user.organization.id } }),
    prisma.sensor.findFirstOrThrow({ where: { orgId: northlineOwner.user.organization.id } }),
    prisma.sensor.findFirstOrThrow({ where: { orgId: meridianOwner.user.organization.id } }),
  ]);
  northlineProductId = product.id;
  northlineBatchId = batch.id;
  meridianProfileId = profile.id;
  northlineProfileId = ownProfile.id;
  northlineStorageUnitId = northlineStorageUnit.id;
  northlineSensorId = northlineSensor.id;
  meridianSensorId = meridianSensor.id;
});

describe("organization isolation", () => {
  it("only lists resources owned by the caller's organization", async () => {
    const northline = await request(app).get("/api/v1/batches?pageSize=50").set(bearer(northlineOwner.token));
    const meridian = await request(app).get("/api/v1/batches?pageSize=50").set(bearer(meridianOwner.token));

    expect(northline.status).toBe(200);
    expect(meridian.status).toBe(200);
    expect(northline.body.meta.total).toBeGreaterThan(0);
    expect(meridian.body.meta.total).toBe(1);
    expect(meridian.body.data[0].batchNumber).toBe("FLU-2026-311");
  });

  it("returns 404 rather than leaking another tenant's shipment", async () => {
    const res = await request(app)
      .get(`/api/v1/shipments/${northlineShipmentId}`)
      .set(bearer(meridianOwner.token));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("rejects telemetry series reads for a sensor outside the tenant", async () => {
    const northlineSensors = await request(app)
      .get("/api/v1/devices?pageSize=50")
      .set(bearer(northlineOwner.token));
    const foreignSensorId = northlineSensors.body.data[0].id as string;

    const res = await request(app)
      .get(`/api/v1/telemetry/series?sensorId=${foreignSensorId}`)
      .set(bearer(meridianOwner.token));

    expect([400, 404]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it("scopes dashboard metrics to the caller's organization", async () => {
    const northline = await request(app).get("/api/v1/dashboard/overview").set(bearer(northlineOwner.token));
    const meridian = await request(app).get("/api/v1/dashboard/overview").set(bearer(meridianOwner.token));

    expect(northline.status).toBe(200);
    expect(meridian.status).toBe(200);
    expect(northline.body.data.kpis.activeShipments).toBeGreaterThan(0);
    expect(meridian.body.data.kpis.activeShipments).toBe(0);
    expect(northline.body.data.sensorByStatus.ONLINE).toBeGreaterThan(
      meridian.body.data.sensorByStatus.ONLINE ?? 0
    );
  });

  it("rejects another organization's temperature profile on product create and update", async () => {
    const { prisma } = await import("../src/lib/prisma");
    const create = await request(app)
      .post("/api/v1/products")
      .set(bearer(northlineOwner.token))
      .send({
        code: "CROSS-ORG-PROFILE",
        name: "Cross organization profile test",
        category: "Test",
        storageType: "FRIDGE",
        minTemp: 2,
        maxTemp: 8,
        isActive: true,
        temperatureProfileId: meridianProfileId,
      });

    expect(create.status).toBe(400);
    expect(
      await prisma.product.findFirst({ where: { orgId: northlineOwner.user.organization.id, code: "CROSS-ORG-PROFILE" } })
    ).toBeNull();

    const before = await prisma.product.findUniqueOrThrow({ where: { id: northlineProductId } });
    const update = await request(app)
      .patch("/api/v1/products/" + northlineProductId)
      .set(bearer(northlineOwner.token))
      .send({ temperatureProfileId: meridianProfileId });

    expect(update.status).toBe(400);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: northlineProductId } })).temperatureProfileId).toBe(
      before.temperatureProfileId
    );

    const sameOrgUpdate = await request(app)
      .patch("/api/v1/products/" + northlineProductId)
      .set(bearer(northlineOwner.token))
      .send({ temperatureProfileId: northlineProfileId });
    expect(sameOrgUpdate.status).toBe(200);
    expect(sameOrgUpdate.body.data.temperatureProfileId).toBe(northlineProfileId);
  });

  it("rejects another organization's temperature profile on batch create and update", async () => {
    const { prisma } = await import("../src/lib/prisma");
    const create = await request(app)
      .post("/api/v1/batches")
      .set(bearer(northlineOwner.token))
      .send({
        productId: northlineProductId,
        batchNumber: "CROSS-ORG-PROFILE",
        manufacturedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2027-01-01T00:00:00.000Z",
        quantity: 10,
        status: "QUARANTINE",
        temperatureProfileId: meridianProfileId,
      });

    expect(create.status).toBe(400);
    expect(
      await prisma.batch.findFirst({
        where: { orgId: northlineOwner.user.organization.id, batchNumber: "CROSS-ORG-PROFILE" },
      })
    ).toBeNull();

    const before = await prisma.batch.findUniqueOrThrow({ where: { id: northlineBatchId } });
    const update = await request(app)
      .patch("/api/v1/batches/" + northlineBatchId)
      .set(bearer(northlineOwner.token))
      .send({ temperatureProfileId: meridianProfileId });

    expect(update.status).toBe(400);
    expect((await prisma.batch.findUniqueOrThrow({ where: { id: northlineBatchId } })).temperatureProfileId).toBe(
      before.temperatureProfileId
    );

    const sameOrgUpdate = await request(app)
      .patch("/api/v1/batches/" + northlineBatchId)
      .set(bearer(northlineOwner.token))
      .send({ temperatureProfileId: northlineProfileId });
    expect(sameOrgUpdate.status).toBe(200);
    expect(sameOrgUpdate.body.data.temperatureProfileId).toBe(northlineProfileId);
  });

  it("rejects another organization's sensor on a storage-unit maintenance record", async () => {
    const { prisma } = await import("../src/lib/prisma");
    const before = await prisma.maintenanceLog.count({
      where: { orgId: northlineOwner.user.organization.id, storageUnitId: northlineStorageUnitId },
    });
    const crossOrg = await request(app)
      .post(`/api/v1/storage-units/${northlineStorageUnitId}/maintenance`)
      .set(bearer(northlineOwner.token))
      .send({ type: "CALIBRATION", performedBy: "Tenant test", sensorId: meridianSensorId });

    expect(crossOrg.status).toBe(400);
    expect(
      await prisma.maintenanceLog.count({
        where: { orgId: northlineOwner.user.organization.id, storageUnitId: northlineStorageUnitId },
      })
    ).toBe(before);

    const sameOrg = await request(app)
      .post(`/api/v1/storage-units/${northlineStorageUnitId}/maintenance`)
      .set(bearer(northlineOwner.token))
      .send({ type: "CALIBRATION", performedBy: "Tenant test", sensorId: northlineSensorId });
    expect(sameOrg.status).toBe(201);
  });
});

describe("role-based access control", () => {
  it("forbids a viewer from writing products", async () => {
    const res = await request(app)
      .post("/api/v1/products")
      .set(bearer(northlineViewer.token))
      .send({
        code: "VIEWER-TEST",
        name: "Viewer should not create",
        category: "Test",
        minTemp: 2,
        maxTemp: 8,
      });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/Missing permission/i);
  });

  it("forbids an operator (without incident:resolve) from resolving incidents", async () => {
    const incidents = await request(app).get("/api/v1/incidents?status=OPEN").set(bearer(northlineOwner.token));
    const incidentId = incidents.body.data[0].id as string;

    const res = await request(app)
      .post(`/api/v1/incidents/${incidentId}/resolve`)
      .set(bearer(northlineOperator.token))
      .send({ resolutionNotes: "Operator attempted resolution without authority", outcome: "OTHER" });

    expect(res.status).toBe(403);
  });

  it("allows an auditor to read the immutable audit trail but not mutate it", async () => {
    const read = await request(app).get("/api/v1/audit-logs").set(bearer(northlineAuditor.token));
    expect(read.status).toBe(200);
    expect(read.body.meta.total).toBeGreaterThan(0);

    const write = await request(app)
      .post("/api/v1/incidents/does-not-matter/notes")
      .set(bearer(northlineAuditor.token))
      .send({ notes: "auditor cannot annotate" });
    expect(write.status).toBe(403);
  });

  it("rejects a membership that is revoked in the database immediately", async () => {
    const session = await login(NORTHLINE.viewer);
    const { prisma } = await import("../src/lib/prisma");
    const membership = await prisma.membership.findFirstOrThrow({
      where: { orgId: session.user.organization.id, userId: session.user.id },
    });

    const before = await request(app).get("/api/v1/auth/me").set(bearer(session.token));
    expect(before.status).toBe(200);

    await prisma.membership.delete({ where: { id: membership.id } });
    const revoked = await request(app).get("/api/v1/auth/me").set(bearer(session.token));
    expect(revoked.status).toBe(401);

    await prisma.membership.create({
      data: {
        orgId: session.user.organization.id,
        userId: session.user.id,
        roleId: membership.roleId,
      },
    });
  });
});
