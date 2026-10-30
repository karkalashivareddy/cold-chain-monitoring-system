import { describe, expect, it } from "vitest";
import { envSchema } from "../src/config/env";

const base = {
  NODE_ENV: "production",
  API_PORT: "4000",
  API_ORIGIN: "https://api.example.org",
  WEB_ORIGIN: "https://app.example.org",
  DATABASE_URL: "mysql://frostguard:strong@db.example.org:3306/frostguard",
  JWT_ACCESS_SECRET: "a-production-access-secret-with-more-than-32-bytes",
  JWT_REFRESH_SECRET: "a-distinct-production-refresh-secret-over-32-bytes",
  DEVICE_HMAC_SECRET: "a-production-device-secret-with-more-than-32-bytes",
  SEED_DEMO_PASSWORD: "a-unique-seed-password-never-used-for-demo",
};

describe("production environment validation", () => {
  it("accepts unique production secrets", () => {
    expect(envSchema.safeParse(base).success).toBe(true);
  });

  it("rejects development placeholders and reused JWT secrets", () => {
    expect(envSchema.safeParse({ ...base, DEVICE_HMAC_SECRET: "dev-only-device-hmac-secret-change-me-0123456789abcdef" }).success).toBe(false);
    expect(envSchema.safeParse({ ...base, JWT_REFRESH_SECRET: base.JWT_ACCESS_SECRET }).success).toBe(false);
    expect(envSchema.safeParse({ ...base, SEED_DEMO_PASSWORD: "Frostguard#2026" }).success).toBe(false);
  });
});
