import { describe, expect, it } from "vitest";
import request from "supertest";
import { app, cookieValue, login, bearer, NORTHLINE } from "./helpers";

describe("authentication and session lifecycle", () => {
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

  it("requires a valid access token for protected resources", async () => {
    const anonymous = await request(app).get("/api/v1/dashboard/overview");
    expect(anonymous.status).toBe(401);

    const forged = await request(app)
      .get("/api/v1/dashboard/overview")
      .set(bearer("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.invalid"));
    expect(forged.status).toBe(401);
  });
});
