import { describe, expect, it, beforeAll } from "vitest";
import request from "supertest";
import { app, bearer, login, NORTHLINE, MERIDIAN } from "./helpers";
import { prisma } from "../src/lib/prisma";

let token: string;
let managerToken: string;
let otherTenantToken: string;

beforeAll(async () => {
  token = (await login(NORTHLINE.owner)).token;
  managerToken = (await login(NORTHLINE.manager)).token;
  otherTenantToken = (await login(MERIDIAN.owner)).token;
});

describe("MySQL database engineering surface", () => {
  it("limits operational database metadata to organization administrators", async () => {
    const manager = await request(app).get("/api/v1/dbms/overview").set(bearer(managerToken));
    const otherTenant = await request(app).get("/api/v1/dbms/overview").set(bearer(otherTenantToken));
    expect(manager.status).toBe(403);
    expect(otherTenant.status).toBe(200);
  });

  it("reports the real schema inventory", async () => {
    const res = await request(app).get("/api/v1/dbms/overview").set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.data.tables).toBeGreaterThan(20);
    expect(res.body.data.views).toBe(5);
    expect(res.body.data.triggers).toBe(6);
    expect(res.body.data.procedures).toBe(2);
    expect(res.body.data.indexes).toBeGreaterThan(20);
  });

  it("exposes the analytical views and integrity triggers", async () => {
    const [views, triggers, routines] = await Promise.all([
      request(app).get("/api/v1/dbms/views").set(bearer(token)),
      request(app).get("/api/v1/dbms/triggers").set(bearer(token)),
      request(app).get("/api/v1/dbms/routines").set(bearer(token)),
    ]);

    expect(views.status).toBe(200);
    expect(views.body.data.map((v: { name: string }) => v.name)).toEqual(
      expect.arrayContaining([
        "v_active_excursions",
        "v_shipment_risk",
        "v_warehouse_performance",
        "v_device_health",
        "v_active_incidents",
      ])
    );
    expect(triggers.body.data.map((t: { name: string }) => t.name)).toEqual(
      expect.arrayContaining([
        "trg_sensor_readings_immutable",
        "trg_batches_stock_guard",
        "trg_incident_resolution_guard",
        "trg_shipment_delivery_stamp",
        "trg_audit_logs_immutable_update",
        "trg_audit_logs_immutable_delete",
      ])
    );
    expect(routines.body.data.map((r: { name: string }) => r.name)).toEqual(
      expect.arrayContaining(["sp_reserve_batch_stock", "sp_incident_summary"])
    );
  });

  it("rejects direct updates and deletes of audit rows at the database layer", async () => {
    const row = await prisma.auditLog.create({
      data: { orgId: (await prisma.organization.findUniqueOrThrow({ where: { slug: "northline" } })).id, action: "test.immutable", entityType: "test" },
    });
    await expect(prisma.auditLog.update({ where: { id: row.id }, data: { action: "test.changed" } })).rejects.toThrow(/audit_logs is append-only/i);
    await expect(prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/audit_logs is append-only/i);
  });

  it("returns a real EXPLAIN plan for the telemetry range query", async () => {
    const res = await request(app)
      .get("/api/v1/dbms/explain?query=telemetry-range")
      .set(bearer(token));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.plan)).toBe(true);
    expect(res.body.data.plan.length).toBeGreaterThan(0);
  });

  it("proves transaction rollback from the database, not from memory", async () => {
    const res = await request(app).post("/api/v1/dbms/verify-rollback").set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.data.insertedInsideTransaction).toBe(true);
    expect(res.body.data.rowsAfterRollback).toBe(0);
    expect(res.body.data.atomic).toBe(true);
  });

  it("executes the incident summary stored procedure", async () => {
    const res = await request(app).get("/api/v1/dbms/incident-summary").set(bearer(token));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty("status");
    expect(res.body.data[0]).toHaveProperty("total");
  });
});
