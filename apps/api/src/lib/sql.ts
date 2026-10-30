import mysql from "mysql2/promise";
import { env } from "../config/env";

/**
 * Prisma talks to MySQL through the prepared-statement protocol, which does not
 * preserve result-set column metadata for `CALL` statements: a procedure that
 * selects `status, severity, total` comes back as `f0, f1, f2`. Procedures that
 * only mutate data (such as the stock reservation guard) are fine, but any
 * routine whose result set is surfaced through the API must use the text
 * protocol. A short-lived connection per call keeps this out of the hot path
 * and avoids leaking pooled sockets into the test runner.
 */
export async function callProcedure<T extends Record<string, unknown>>(
  name: string,
  args: unknown[] = []
): Promise<T[]> {
  const url = new URL(env.DATABASE_URL);
  const connection = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    timezone: "Z",
    multipleStatements: false,
  });

  try {
    const placeholders = args.map(() => "?").join(", ");
    const [result] = await connection.query(`CALL \`${name}\`(${placeholders})`, args);
    // mysql2 returns every result set of a CALL, followed by the closing
    // ResultSetHeader: [[{...rows}], ResultSetHeader]. Only the first set is a
    // procedure SELECT payload.
    const sets = result as unknown[];
    const first = Array.isArray(sets[0]) ? sets[0] : sets;
    return first as T[];
  } finally {
    await connection.end();
  }
}
