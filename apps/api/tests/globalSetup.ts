import { execSync } from "node:child_process";
import path from "node:path";
import mysql from "mysql2/promise";

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? "mysql://root:root@localhost:3306/frostguard_test";

/**
 * The integration suite runs against a disposable MySQL database. It is reset
 * and seeded once per run, then every test exercises the real HTTP surface,
 * real Prisma queries and the real MySQL triggers/procedures.
 */
export default async function globalSetup() {
  const url = new URL(DATABASE_URL);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!/_test$/i.test(databaseName)) {
    throw new Error("Refusing to reset an integration-test database unless its name ends with _test");
  }
  if (!new Set(["localhost", "127.0.0.1", "::1"]).has(url.hostname)) {
    throw new Error("Refusing to reset a non-loopback integration-test database");
  }
  const connection = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  });
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await connection.end();

  const cwd = path.resolve(__dirname, "..");
  const env = { ...process.env, DATABASE_URL, NODE_ENV: "test", LOG_LEVEL: "silent" };

  execSync("npx prisma db push --force-reset --skip-generate --schema prisma/schema.prisma", {
    cwd,
    env,
    stdio: "pipe",
    shell: true,
  });
  execSync("npx tsx prisma/apply-sql.ts", { cwd, env, stdio: "pipe", shell: true });
  execSync("npx tsx prisma/seed.ts", { cwd, env, stdio: "pipe", shell: true });
}
