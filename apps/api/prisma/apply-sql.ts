import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { env } from "../src/config/env";

const SQL_DIR = path.resolve(__dirname, "../../../database/sql");

/**
 * Prisma's prepared-statement protocol cannot execute DDL such as
 * `DROP TRIGGER`. This migration step therefore uses a direct mysql2
 * connection which speaks the text protocol, while Prisma remains the
 * application data-access layer.
 */
async function main() {
  if (!fs.existsSync(SQL_DIR)) {
    console.error(`SQL directory not found: ${SQL_DIR}`);
    process.exit(1);
  }

  const url = new URL(env.DATABASE_URL);
  const connection = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    multipleStatements: false,
  });

  const files = fs
    .readdirSync(SQL_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  try {
    for (const file of files) {
      const raw = fs.readFileSync(path.join(SQL_DIR, file), "utf8");
      const statements = raw
        .split("-- @statement")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith("-- =="));

      console.log(`\n▶ ${file} (${statements.length} statements)`);
      for (const statement of statements) {
        const preview = statement.split("\n")[0]?.slice(0, 90);
        try {
          await connection.query(statement);
          console.log(`  ✓ ${preview}`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const ignorable =
            /Duplicate key name|Duplicate foreign key constraint name|already exists|check constraint .* already exists/i.test(
              message
            );
          if (ignorable) {
            console.log(`  ~ skipped (already applied): ${preview}`);
          } else {
            console.error(`  ✗ failed: ${preview}\n    ${message}`);
            throw err;
          }
        }
      }
    }
  } finally {
    await connection.end();
  }

  console.log("\n✔ Database views, triggers, procedures and constraints applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
