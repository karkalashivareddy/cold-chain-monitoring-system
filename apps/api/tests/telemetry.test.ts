import { describe, expect, it, beforeAll } from "vitest";
import request from "supertest";
import { app, bearer, login, NORTHLINE } from "./helpers";
import { prisma } from "../src/lib/prisma";

const COLD_ROOM_KEY = "fgd_demo_fgs-hyd-c1a_2026";
const FREEZER_KEY = "fgd_demo_fgs-hyd-f1a_2026";

let token: string;

beforeAll(async () => {
  token = (await login(NORTHLINE.owner)).token;
});

function reading(overrides: Record<string, unknown>) {
  return {
    deviceId: "FGS-HYD-C1A",
    temperature: 4.2,
    humidity: 48,
    recordedAt: new Date().toISOString(),
    sequenceNumber: 9100,
    ...overrides,
  };
}

describe("device-authenticated telemetry ingestion", () => {
  it("rejects missing and invalid device credentials", async () => {
    const missing = await request(app)
      .post("/api/v1/telemetry/readings")
      .send(reading({ sequenceNumber: 9001 }));
    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe("DEVICE_AUTH_FAILED");

    const invalid = await request(app)
      .post("/api/v1/telemetry/readings")
      .set("x-device-key", "fgd_not_a_real_key")
      .send(reading({ sequenceNumber: 9002 }));
    expect(invalid.status).toBe(401);
    expect(invalid.body.error.code).toBe("DEVICE_AUTH_FAILED");
  });

  it("stores a validated reading with real provenance", async () => {
    const res = await request(app)
      .post("/api/v1/telemetry/readings")
      .set("x-device-key", COLD_ROOM_KEY)
      .send(reading({ sequenceNumber: 9100, temperature: 4.2, isSimulated: true }));

    expect(res.status).toBe(201);
    expect(res.body.data.duplicate).toBe(false);
    expect(res.body.data.evaluation.state).toBe("NORMAL");
    expect(res.body.data.readingId).toBeTruthy();

    const stored = await prisma.sensorReading.findFirstOrThrow({
      where: { sequenceNumber: 9100, sensor: { deviceId: "FGS-HYD-C1A" } },
    });
    expect(Number(stored.temperature)).toBe(4.2);
    expect(stored.isSimulated).toBe(false);
    expect(stored.source).toBe("DEVICE");
  });

  it("stores late lower-sequence readings without changing live excursion state", async () => {
    const current = await request(app)
      .post("/api/v1/telemetry/readings")
      .set("x-device-key", COLD_ROOM_KEY)
      .send(reading({ sequenceNumber: 9930, temperature: 4.2, recordedAt: new Date().toISOString() }));
    expect(current.status).toBe(201);
    expect(current.body.data.outOfOrder).toBe(false);

    const openBefore = await prisma.excursion.count({
      where: { sensor: { deviceId: "FGS-HYD-C1A" }, status: "OPEN" },
    });
    const late = await request(app)
      .post("/api/v1/telemetry/readings")
      .set("x-device-key", COLD_ROOM_KEY)
      .send(
        reading({
          sequenceNumber: 9929,
          temperature: 20,
          recordedAt: new Date(Date.now() - 60_000).toISOString(),
          isSimulated: true,
        })
      );

    expect(late.status).toBe(201);
    expect(late.body.data.outOfOrder).toBe(true);
    expect(late.body.data.message).toMatch(/live excursion state was not changed/i);
    expect(
      await prisma.excursion.count({
        where: { sensor: { deviceId: "FGS-HYD-C1A" }, status: "OPEN" },
      })
    ).toBe(openBefore);

    const stored = await prisma.sensorReading.findFirstOrThrow({
      where: { sequenceNumber: 9929, sensor: { deviceId: "FGS-HYD-C1A" } },
    });
    expect(stored.isSimulated).toBe(false);
    expect(stored.source).toBe("DEVICE");
  });

  it("treats a replayed sequence number as an idempotent no-op", async () => {
    const res = await request(app)
      .post("/api/v1/telemetry/readings")
      .set("x-device-key", COLD_ROOM_KEY)
      .send(reading({ sequenceNumber: 9100, temperature: 4.2 }));

    expect(res.status).toBe(200);
    expect(res.body.data.duplicate).toBe(true);

    const count = await prisma.sensorReading.count({
      where: { sequenceNumber: 9100, sensor: { deviceId: "FGS-HYD-C1A" } },
    });
    expect(count).toBe(1);
  });

  it("rejects a reading outside the accepted clock window", async () => {
    const res = await request(app)
      .post("/api/v1/telemetry/readings")
      .set("x-device-key", COLD_ROOM_KEY)
      .send(reading({ sequenceNumber: 9101, recordedAt: "2020-01-01T00:00:00.000Z" }));

    expect(res.status).toBe(400);
  });

  it("raises a persisted critical excursion, alert and incident across the transaction", async () => {
    const first = await request(app)
      .post("/api/v1/telemetry/readings")
      .set("x-device-key", FREEZER_KEY)
      .send({
        deviceId: "FGS-HYD-F1A",
        temperature: 5,
        humidity: 45,
        recordedAt: new Date().toISOString(),
        sequenceNumber: 9200,
      });
    // Persistence rule requires two consecutive out-of-range readings.
    expect(first.status).toBe(201);
    expect(first.body.data.excursionId).toBeNull();

    const second = await request(app)
      .post("/api/v1/telemetry/readings")
      .set("x-device-key", FREEZER_KEY)
      .send({
        deviceId: "FGS-HYD-F1A",
        temperature: 5.5,
        humidity: 45,
        recordedAt: new Date().toISOString(),
        sequenceNumber: 9201,
      });

    expect(second.status).toBe(201);
    expect(second.body.data.evaluation.state).toBe("CRITICAL");
    expect(second.body.data.excursionId).toBeTruthy();
    expect(second.body.data.alertId).toBeTruthy();
    expect(second.body.data.incidentId).toBeTruthy();

    const incident = await prisma.incident.findUniqueOrThrow({
      where: { id: second.body.data.incidentId },
      include: { alert: true, excursion: true },
    });
    expect(incident.severity).toBe("CRITICAL");
    expect(incident.status).toBe("OPEN");
    expect(incident.alert?.severity).toBe("CRITICAL");
    expect(incident.excursion?.status).toBe("OPEN");
  });

  it("enforces append-only telemetry at the database layer", async () => {
    const stored = await prisma.sensorReading.findFirstOrThrow({
      where: { sequenceNumber: 9100, sensor: { deviceId: "FGS-HYD-C1A" } },
    });

    await expect(
      prisma.sensorReading.update({
        where: { id: stored.id },
        data: { temperature: 1.1 },
      })
    ).rejects.toThrow(/append-only|immutable/i);
  });

  it("scopes history queries to the caller's organization", async () => {
    const res = await request(app)
      .get("/api/v1/telemetry/readings?pageSize=5")
      .set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBeGreaterThan(0);
    expect(res.body.data.every((r: { source: string }) => typeof r.source === "string")).toBe(true);
  });
});
