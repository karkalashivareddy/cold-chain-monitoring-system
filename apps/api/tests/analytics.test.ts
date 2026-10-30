import { describe, expect, it } from "vitest";
import request from "supertest";
import { app, bearer, login, NORTHLINE } from "./helpers";

describe("organization analytics API", () => {
  it("returns delivery aggregates with numeric fields for the dashboard", async () => {
    const token = (await login(NORTHLINE.owner)).token;
    const response = await request(app).get("/api/v1/analytics").set(bearer(token));

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveProperty("risk.shipments");
    expect(response.body.data).toHaveProperty("warehouses");
    expect(response.body.data).toHaveProperty("devices");
    expect(response.body.data).toHaveProperty("delivery");
    for (const month of response.body.data.delivery) {
      expect(month).toEqual(expect.objectContaining({
        month: expect.any(String),
        delivered: expect.any(Number),
        onTime: expect.any(Number),
        delayed: expect.any(Number),
      }));
    }
  });
});
