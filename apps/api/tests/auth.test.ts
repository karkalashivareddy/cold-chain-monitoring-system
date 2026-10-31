import { describe, expect, it } from "vitest";
import request from "supertest";
import { app, cookieValue, login, bearer, NORTHLINE } from "./helpers";
import { prisma } from "../src/lib/prisma";

describe("authentication and session lifecycle", () => {
  it("serves the API documentation and machine-readable route specification", async () => {
    const page = await request(app).get("/api/v1/docs");
    expect(page.status).toBe(200);
    expect(page.headers["content-type"]).toContain("text/html");
    expect(page.text).toContain("/api/v1/openapi.json");

    const spec = await request(app).get("/api/v1/openapi.json");
    expect(spec.status).toBe(200);
    expect(spec.body.openapi).toBe("3.1.0");
    expect(spec.body.paths["/telemetry/readings"].post.security).toEqual([{ deviceKey: [] }]);
    expect(spec.body.paths["/telemetry/readings"].post.requestBody.description).toContain("bootId");
    expect(spec.body.paths["/incidents/{id}/resolve"].post).toBeDefined();
    expect(spec.body.paths["/shipments/{id}/dispatch"].post.requestBody).toBeUndefined();
    expect(spec.body.paths["/health/ready"].get.security).toEqual([]);
    expect(spec.body.paths["/reports/temperature"].get.responses["200"].content["text/csv"]).toBeDefined();
    expect(spec.body.paths["/products"].post.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "x-frostguard-csrf", in: "header", required: false }),
    ]));
    expect(spec.body.paths["/storage-units/{id}/maintenance"].post.responses["201"]).toBeDefined();
    expect(spec.body.paths["/shipments/{id}/events"].post.responses["201"]).toBeDefined();
  });

  it("rejects an invalid password without revealing whether the account exists", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: NORTHLINE.owner, password: "definitely-not-the-password" });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
    expect(res.body.error.message).toBe("Invalid email or password");
  });

  it("issues a session with database-derived role and permissions", async () => {
    const session = await login(NORTHLINE.owner);

    expect(session.user.organization.slug).toBe("northline");
    expect(session.user.role).toBe("owner");
    expect(session.user.permissions).toContain("incident:resolve");
    expect(session.token.split(".")).toHaveLength(3);

    const me = await request(app).get("/api/v1/auth/me").set(bearer(session.token));
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe(NORTHLINE.owner);
    expect(me.body.data.permissions).toEqual(expect.arrayContaining(["org:manage", "audit:read"]));
  });

  it("sets hardened httpOnly cookies for the browser flow", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: NORTHLINE.viewer, password: "Frostguard#2026" });

    expect(res.status).toBe(200);
    const raw = (res.headers["set-cookie"] as unknown as string[]) ?? [];
    const access = raw.find((c) => c.startsWith("fg_access="));
    const refresh = raw.find((c) => c.startsWith("fg_refresh="));
    expect(access).toBeTruthy();
    expect(refresh).toBeTruthy();
    expect(access!.toLowerCase()).toContain("httponly");
    expect(access!.toLowerCase()).toContain("samesite=lax");
    expect(refresh!.toLowerCase()).toContain("path=/api/v1/auth");
  });

  it("rotates refresh tokens and revokes the whole family on reuse", async () => {
    const session = await login(NORTHLINE.manager);
    expect(session.refreshToken).toBeTruthy();

    const first = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: session.refreshToken });
    expect(first.status).toBe(200);
    const rotated = cookieValue(first, "fg_refresh");
    expect(rotated).toBeTruthy();
    expect(rotated).not.toBe(session.refreshToken);

    // Replaying the already-rotated token is treated as theft.
    const replay = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: session.refreshToken });
    expect(replay.status).toBe(401);
    expect(replay.body.error.message).toMatch(/reuse/i);

    // The descendant token in the same family is revoked too.
    const afterRevocation = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: rotated });
    expect(afterRevocation.status).toBe(401);
  });

  it("keeps a refresh-token family in the organization selected at login", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: NORTHLINE.owner } });
    const meridian = await prisma.organization.findUniqueOrThrow({ where: { slug: "meridian" } });
    const ownerRole = await prisma.role.findUniqueOrThrow({ where: { key: "owner" } });
    await prisma.membership.create({ data: { userId: user.id, orgId: meridian.id, roleId: ownerRole.id } });

    try {
      const selected = await login(NORTHLINE.owner, { organizationSlug: "meridian" });
      expect(selected.user.organization.slug).toBe("meridian");
      const refreshed = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: selected.refreshToken });
      expect(refreshed.status).toBe(200);

      const me = await request(app)
        .get("/api/v1/auth/me")
        .set(bearer(refreshed.body.data.accessToken));
      expect(me.status).toBe(200);
      expect(me.body.data.organization.slug).toBe("meridian");
    } finally {
      await prisma.membership.delete({ where: { orgId_userId: { orgId: meridian.id, userId: user.id } } });
    }
  });

  it("requires a valid access token for protected resources", async () => {
    const anonymous = await request(app).get("/api/v1/dashboard/overview");
    expect(anonymous.status).toBe(401);

    const forged = await request(app)
      .get("/api/v1/dashboard/overview")
      .set(bearer("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.invalid"));
    expect(forged.status).toBe(401);
  });
});
