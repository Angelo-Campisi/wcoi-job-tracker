// Test helpers: build a fresh database from the migrations and act as different people.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const ROOT = path.resolve(__dirname, "..");
export const TEST_DB_NAME = "wcoi_db_test";

// Fixed ids from supabase/seed.sql.
export const ids = {
  emp: (n: number) => `10000000-0000-4000-8000-00000000000${n}`,
  leadA: "20000000-0000-4000-8000-0000000000a1",
  leadB: "20000000-0000-4000-8000-0000000000a2",
  bookkeeper: "20000000-0000-4000-8000-0000000000a7",
  owner: "20000000-0000-4000-8000-0000000000a8",
  wo1001: "30000000-0000-4000-8000-000000001001",
  wo1002: "30000000-0000-4000-8000-000000001002",
  wo1003: "30000000-0000-4000-8000-000000001003",
};

/** The Supabase login id for each app user (created by the tests, like a first sign-in). */
export function authIdFor(appUserId: string): string {
  return "90000000" + appUserId.slice(8);
}

function sqlFile(...parts: string[]): string {
  return readFileSync(path.join(ROOT, ...parts), "utf8");
}

/** Drops and recreates the test database, then applies shim, migrations, and seed. */
export async function buildTestDatabase(adminUrl: string): Promise<string> {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`drop database if exists ${TEST_DB_NAME} with (force)`);
  await admin.query(`create database ${TEST_DB_NAME}`);
  await admin.end();

  const url = new URL(adminUrl);
  url.pathname = `/${TEST_DB_NAME}`;
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  await client.query(sqlFile("tests", "supabase-shim.sql"));
  const migrations = readdirSync(path.join(ROOT, "migrations")).filter((f) => f.endsWith(".sql")).sort();
  for (const file of migrations) await client.query(sqlFile("migrations", file));
  await client.query(sqlFile("seed.sql"));

  // Link each app user to a login, as the first sign-in will.
  for (const id of [ids.leadA, ids.leadB, ids.bookkeeper, ids.owner]) {
    await client.query("insert into auth.users (id) values ($1)", [authIdFor(id)]);
    await client.query("update public.app_users set auth_user_id = $1 where id = $2", [authIdFor(id), id]);
  }
  await client.end();
  return url.toString();
}

export type Who = "anon" | "service_role" | string;

/**
 * Switches the current transaction to act as someone:
 * an app user id (signed in), "anon" (not signed in), or "service_role" (the server).
 */
export async function actAs(c: pg.Client, who: Who): Promise<void> {
  await c.query("reset role");
  if (who === "anon" || who === "service_role") {
    await c.query("select set_config('request.jwt.claims', '', true)");
    await c.query(`set local role ${who}`);
    return;
  }
  await c.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: authIdFor(who), role: "authenticated" }),
  ]);
  await c.query("set local role authenticated");
}

/** Runs `fn` in a transaction that is always rolled back, so tests never affect each other. */
export async function inRollback(c: pg.Client, fn: () => Promise<void>): Promise<void> {
  await c.query("begin");
  try {
    await fn();
  } finally {
    await c.query("rollback");
  }
}

/** Runs one statement that is expected to fail, without aborting the surrounding transaction. */
export async function expectFailure(
  c: pg.Client,
  sql: string,
  params: unknown[] = [],
): Promise<string> {
  await c.query("savepoint expect_failure");
  try {
    await c.query(sql, params);
  } catch (err) {
    await c.query("rollback to savepoint expect_failure");
    return (err as Error).message;
  }
  await c.query("release savepoint expect_failure");
  throw new Error(`Expected this to fail, but it succeeded: ${sql}`);
}
