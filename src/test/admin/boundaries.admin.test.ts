import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static guards for the admin path (docs/ADMIN.md §5): admin reads and writes
 * use the signed-in admin's own JWT, never the service-role client, and the
 * modules that reach the session are server-only.
 */

const SRC = path.join(process.cwd(), "src");
const ADMIN_LIB = path.join(SRC, "lib", "admin");
const AUTH_LIB = path.join(SRC, "lib", "auth");

function listSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return listSourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

const read = (file: string) => readFileSync(file, "utf8");
const rel = (file: string) => path.relative(SRC, file);

const SERVICE_CLIENT_IMPORT =
  /from\s+["'](@\/lib\/data\/clients\/(service|service-config)|\.\.?\/.*clients\/(service|service-config))["']/;

function isClientComponent(source: string): boolean {
  const withoutComments = source.replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, "");
  return /^\s*["']use client["']/.test(withoutComments);
}

describe("admin path boundaries", () => {
  const adminFiles = [...listSourceFiles(ADMIN_LIB), ...listSourceFiles(AUTH_LIB)];

  it("has admin modules to check", () => {
    expect(adminFiles.map(rel)).toContain(path.join("lib", "admin", "mutations", "operations.ts"));
  });

  it("never imports the service-role client or its configuration", () => {
    const offenders = adminFiles.filter((file) => SERVICE_CLIENT_IMPORT.test(read(file)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it("never reads the service-role key", () => {
    const offenders = adminFiles.filter((file) => read(file).includes("SUPABASE_SERVICE_ROLE_KEY"));
    expect(offenders.map(rel)).toEqual([]);
  });

  it("marks the session-bound admin wiring as server-only", () => {
    const wiring = path.join(ADMIN_LIB, "mutations", "server.ts");
    expect(read(wiring)).toMatch(/^import\s+["']server-only["'];?\s*$/m);
  });

  it("keeps admin mutation and query modules out of Client Components", () => {
    const clientComponents = listSourceFiles(SRC).filter((file) => isClientComponent(read(file)));
    const offenders = clientComponents.filter((file) =>
      /^\s*import\s+(?!type\b)[^;]*?from\s+["']@\/lib\/admin\/(mutations|queries)\//m.test(
        read(file),
      ),
    );
    expect(offenders.map(rel)).toEqual([]);
  });

  it("never names a service key in a NEXT_PUBLIC_ variable", () => {
    for (const file of adminFiles) {
      expect(read(file), rel(file)).not.toMatch(/NEXT_PUBLIC_[A-Z_]*SERVICE/);
    }
  });
});
