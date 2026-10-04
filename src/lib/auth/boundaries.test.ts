import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static guards for the admin auth boundary: what may run in the browser, what is
 * server-only, and that there is no self-service sign-up path. The shared admin
 * boundary checks (no service-role client or key in src/lib/auth) live in
 * src/test/admin/boundaries.admin.test.ts.
 */

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const AUTH = path.join(SRC, "lib", "auth");
const AUTH_PAGES = path.join(SRC, "app", "admin", "auth");
const PROXY = path.join(SRC, "proxy.ts");

function listSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return listSourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

const read = (file: string) => readFileSync(file, "utf8");
const rel = (file: string) => path.relative(ROOT, file).split(path.sep).join("/");

function directive(source: string): string | null {
  const withoutComments = source.replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, "");
  return /^\s*["'](use client|use server)["']/.exec(withoutComments)?.[1] ?? null;
}

const hasServerOnlyMarker = (source: string) => /^import\s+["']server-only["'];?\s*$/m.test(source);

/** Runtime (non-type) import specifiers. */
function runtimeImports(source: string): string[] {
  const pattern = /^\s*(?:import|export)\s+(?!type\b)(?:[\s\S]*?\sfrom\s+)?["']([^"']+)["']/gm;
  return [...source.matchAll(pattern)].map((match) => match[1]!);
}

/** src/lib/auth modules a Client Component may import at runtime. */
const BROWSER_SAFE_AUTH_MODULES = new Set(["@/lib/auth/routes", "@/lib/auth/sign-in-state"]);

describe("admin auth boundaries", () => {
  it("marks the session modules as server-only", () => {
    for (const file of ["server.ts", "supabase.ts"]) {
      expect(hasServerOnlyMarker(read(path.join(AUTH, file))), file).toBe(true);
    }
  });

  it("exposes sign-in and sign-out only as server actions", () => {
    expect(directive(read(path.join(AUTH, "actions.ts")))).toBe("use server");
  });

  it("keeps browser-safe modules free of server-only imports", () => {
    for (const file of ["routes.ts", "sign-in-state.ts", "access.ts", "verify.ts", "config.ts"]) {
      const source = read(path.join(AUTH, file));
      expect(hasServerOnlyMarker(source), file).toBe(false);
      expect(
        runtimeImports(source).filter(
          (s) => s === "@/lib/auth/server" || s === "@/lib/auth/supabase",
        ),
        file,
      ).toEqual([]);
    }
  });

  it("lets Client Components import only browser-safe auth modules", () => {
    const clientComponents = listSourceFiles(SRC).filter(
      (file) => directive(read(file)) === "use client",
    );
    const offenders = clientComponents.flatMap((file) =>
      runtimeImports(read(file))
        .filter((s) => s.startsWith("@/lib/auth/") && !BROWSER_SAFE_AUTH_MODULES.has(s))
        .map((s) => `${rel(file)} -> ${s}`),
    );
    expect(offenders).toEqual([]);
  });

  it("never mentions the service-role key in the proxy or the auth pages", () => {
    for (const file of [PROXY, ...listSourceFiles(AUTH_PAGES)]) {
      expect(read(file), rel(file)).not.toMatch(/SERVICE_ROLE|service-config|clients\/service/);
    }
  });

  it("keeps the proxy free of server-only modules", () => {
    const imports = runtimeImports(read(PROXY));
    expect(imports.filter((s) => s === "@/lib/auth/server" || s === "@/lib/auth/supabase")).toEqual(
      [],
    );
  });

  it("has no self-service sign-up path anywhere in the app", () => {
    const offenders = listSourceFiles(SRC).filter((file) =>
      /auth\s*\.\s*(signUp|admin\s*\.\s*createUser|admin\s*\.\s*inviteUserByEmail)\s*\(/.test(
        read(file),
      ),
    );
    expect(offenders.map(rel)).toEqual([]);
  });
});
