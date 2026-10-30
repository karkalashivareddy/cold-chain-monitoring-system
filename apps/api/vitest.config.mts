import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/globalSetup.ts"],
    testTimeout: 30_000,
    hookTimeout: 180_000,
    sequence: { concurrent: false },
    pool: "forks",
    maxWorkers: 1,
    isolate: false,
    env: {
      NODE_ENV: "test",
      API_PORT: "4100",
      DATABASE_URL: "mysql://root:root@localhost:3306/frostguard_test",
      WEB_ORIGIN: "http://localhost:5173",
      JWT_ACCESS_SECRET: "test-access-secret-0123456789abcdef0123456789abcdef",
      JWT_REFRESH_SECRET: "test-refresh-secret-0123456789abcdef0123456789abcdef",
      DEVICE_HMAC_SECRET: "test-device-hmac-secret-0123456789abcdef0123456789",
      LOG_LEVEL: "silent",
      RATE_LIMIT_MAX: "100000",
      LOGIN_RATE_LIMIT_MAX: "1000",
    },
  },
});
