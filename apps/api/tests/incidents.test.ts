import { describe, expect, it, beforeAll } from "vitest";
import request from "supertest";
import { app, bearer, login, NORTHLINE } from "./helpers";
import { prisma } from "../src/lib/prisma";

let token: string;
let incidentId: string;

beforeAll(async () => {
  token = (await login(NORTHLINE.manager)).token;
  const open = await request(app)
    .get("/api/v1/incidents?search=INC-2026-0007")
    .set(bearer(token));
  incidentId = open.body.data[0].id as string;
  expect(incidentId).toBeTruthy();
});

describe("incident lifecycle state machine", () => {
  it("rejects resolution before the incident is acknowledged", async () => {
    const res = await request(app)
      .post(`/api/v1/incidents/${incidentId}/resolve`)
      .set(bearer(token))
      .send({
        resolutionNotes: "Attempting to bypass the acknowledgement step",
        outcome: "PRODUCT_SAFE",
      });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/acknowledged/i);
  });

  it("walks OPEN → ACKNOWLEDGED → INVESTIGATING → RESOLVED with evidence", async () => {
    const ack = await request(app)
      .post(`/api/v1/incidents/${incidentId}/acknowledge`)
      .set(bearer(token))
      .send({ notes: "Quality team engaged, reefer telemetry under review." });
    expect(ack.status).toBe(200);
    expect(ack.body.data.status).toBe("ACKNOWLEDGED");
    expect(ack.body.data.acknowledgedAt).toBeTruthy();

    const investigating = await request(app)
      .post(`/api/v1/incidents/${incidentId}/investigate`)
      .set(bearer(token))
      .send({ notes: "Reefer compressor cycling verified against telemetry." });
    expect(investigating.status).toBe(200);
    expect(investigating.body.data.status).toBe("INVESTIGATING");

    const resolveInput = {
      resolutionNotes: "Refrigeration equipment serviced and monitored. Batch disposition reviewed by quality staff.",
      outcome: "PRODUCT_SAFE",
      rootCause: "Refrigeration compressor short cycling",
    };
    const resolutions = await Promise.all(
      [0, 1].map(() =>
        request(app)
          .post(`/api/v1/incidents/${incidentId}/resolve`)
          .set(bearer(token))
          .send(resolveInput)
      )
    );
    expect(resolutions.map((response) => response.status).sort()).toEqual([200, 409]);
    const resolved = resolutions.find((response) => response.status === 200)!;
    expect(resolved.body.data.status).toBe("RESOLVED");
    expect(resolved.body.data.outcome).toBe("PRODUCT_SAFE");
    expect(resolved.body.data.resolvedAt).toBeTruthy();

    const persisted = await prisma.incident.findUniqueOrThrow({
      where: { id: incidentId },
      include: { alert: true, excursion: true, actions: true },
    });
    expect(persisted.alert?.status).toBe("RESOLVED");
    expect(persisted.excursion?.status).toBe("CLOSED");
    expect(persisted.actions.map((a) => a.action)).toEqual(
      expect.arrayContaining(["ACKNOWLEDGED", "INVESTIGATION_STARTED", "RESOLVED"])
    );
    expect(persisted.actions.filter((action) => action.action === "RESOLVED")).toHaveLength(1);
  });

  it("records every transition in the audit trail", async () => {
    const audit = await request(app)
      .get("/api/v1/audit-logs?entityType=incident&pageSize=50")
      .set(bearer(token));
    expect(audit.status).toBe(200);
    const actions = audit.body.data.map((row: { action: string }) => row.action);
    expect(actions).toEqual(
      expect.arrayContaining(["incident.acknowledged", "incident.investigating", "incident.resolved"])
    );
  });

  it("blocks a resolved incident without adequate resolution notes at the database layer", async () => {
    const seeded = await prisma.incident.findFirstOrThrow({
      where: { code: "INC-2026-0003", orgId: (await login(NORTHLINE.owner)).user.organization.id },
    });

    await expect(
      prisma.incident.update({
        where: { id: seeded.id },
        data: { status: "RESOLVED", resolutionNotes: "too short" },
      })
    ).rejects.toThrow(/resolution notes/i);
  });
});
