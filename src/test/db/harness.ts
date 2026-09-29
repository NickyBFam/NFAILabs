/**
 * Database test harness (test-only; see docs/DATABASE.md).
 *
 * Creates a fresh, in-process PostgreSQL database with PGlite, loads the Supabase
 * stand-in (supabase-shim.sql), then applies every migration in supabase/migrations/
 * in filename order. Nothing touches the network, Docker, or any real Supabase project.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
export const MIGRATIONS_DIR = join(REPO_ROOT, "supabase", "migrations");
const SEED_FILE = join(REPO_ROOT, "supabase", "seed.sql");
const SHIM_FILE = fileURLToPath(new URL("./supabase-shim.sql", import.meta.url));

/** Supabase-style migration file name: numeric version, underscore, name. */
const MIGRATION_FILE = /^\d+_[a-z0-9_]+\.sql$/;

export type ApiRole = "anon" | "authenticated" | "service_role";

export function listMigrationFiles(dir: string = MIGRATIONS_DIR): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.filter((name) => name.endsWith(".sql")).sort();
}

export function isValidMigrationFileName(name: string): boolean {
  return MIGRATION_FILE.test(name);
}

export interface CreateTestDatabaseOptions {
  /** Apply supabase/seed.sql (synthetic data only) after the migrations. Default false. */
  seed?: boolean;
  /** Apply only migrations whose file name sorts at or before this one. */
  upTo?: string;
}

export async function createTestDatabase(options: CreateTestDatabaseOptions = {}): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { btree_gist, pgcrypto } });
  await db.exec(readFileSync(SHIM_FILE, "utf8"));

  for (const file of listMigrationFiles()) {
    if (options.upTo && file > options.upTo) break;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    try {
      await db.exec(sql);
    } catch (error) {
      await db.close();
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Migration ${file} failed: ${message}`, { cause: error });
    }
  }

  if (options.seed) {
    await db.exec(readFileSync(SEED_FILE, "utf8"));
  }
  return db;
}

/**
 * Runs `fn` inside a transaction as a Supabase API role with the given JWT claims,
 * the way PostgREST does. The transaction is always rolled back, so each call is
 * isolated and leaves no data behind.
 */
export async function asRole<T>(
  db: PGlite,
  role: ApiRole,
  fn: (tx: Transaction) => Promise<T>,
  claims: Record<string, unknown> = {},
): Promise<T> {
  let result: T | undefined;
  await db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ role, ...claims }),
    ]);
    await tx.exec(`set local role ${role}`);
    try {
      result = await fn(tx);
    } finally {
      await tx.rollback();
    }
  });
  return result as T;
}
