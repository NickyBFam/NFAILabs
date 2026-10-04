/**
 * Runs supabase/validation/remote_checks.sql (the script the owner runs against a real
 * Supabase development project) against the local PGlite database, so the script itself
 * is known to be correct before it is used remotely.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createTestDatabase, MIGRATIONS_DIR } from "./harness";

const SCRIPT = join(MIGRATIONS_DIR, "..", "validation", "remote_checks.sql");

let db: PGlite;

beforeAll(async () => {
  db = await createTestDatabase({ seed: true });
});

afterAll(async () => {
  await db.close();
});

it("passes every remote acceptance check on the local database", async () => {
  const results = await db.exec(readFileSync(SCRIPT, "utf8"));
  const rows = results.at(-1)?.rows as { result: string; check_name: string; detail: string }[];
  expect(rows.length).toBeGreaterThanOrEqual(28);
  expect(rows.filter((r) => r.result !== "PASS")).toEqual([]);
});

it("leaves no data behind", async () => {
  const providers = await db.query<{ n: number }>(
    "select count(*)::int as n from public.providers where slug in ('remote-check-provider', 'remote-check-admin-provider')",
  );
  expect(providers.rows[0]?.n).toBe(0);
  const admins = await db.query<{ n: number }>(
    "select count(*)::int as n from public.admin_identities where display_name like 'Remote Check%'",
  );
  expect(admins.rows[0]?.n).toBe(0);
});
