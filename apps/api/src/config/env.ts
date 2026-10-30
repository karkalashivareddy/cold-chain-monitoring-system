import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

// Load apps/api/.env first, then fall back to the repository root .env.
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().default(4000),
  API_ORIGIN: z.string().url().default("http://localhost:4000"),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(10),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(14),
  DEVICE_HMAC_SECRET: z.string().min(32).default("dev-only-device-hmac-secret-change-me-0123456789abcdef"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().default(300),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().default(10),
  LOG_LEVEL: z.string().default("info"),
  SEED_DEMO_PASSWORD: z.string().min(8).default("Frostguard#2026"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Fail closed: never boot with a partially configured security surface.
  console.error("Invalid environment configuration", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === "production",
  isTest: parsed.data.NODE_ENV === "test",
  corsOrigins: parsed.data.WEB_ORIGIN.split(",").map((s) => s.trim()),
  accessTtlMs: parsed.data.ACCESS_TOKEN_TTL_SECONDS * 1000,
  refreshTtlMs: parsed.data.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  cookieSecure: parsed.data.NODE_ENV === "production",
};
