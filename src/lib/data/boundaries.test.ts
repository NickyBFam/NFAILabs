import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static guards for the public / server / service client boundaries.
 *
 * Next.js turns `import "server-only"` in a Client Component graph into a build
 * error. These tests catch the same mistakes earlier (and in unit tests, where
 * `server-only` is stubbed) by walking the real import graph under src/.
 */

const SRC = path.join(process.cwd(), "src");
const DATA = path.join(SRC, "lib", "data");

const SERVER_ONLY_MODULES = [
  "clients/server.ts",
  "clients/service.ts",
  "clients/service-config.ts",
].map((file) => path.join(DATA, file));

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return listSourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const isTestFile = (file: string) =>
  /\.test\.tsx?$/.test(file) || file.includes(`${path.sep}test${path.sep}`);
const sourceFiles = listSourceFiles(SRC).filter((file) => !isTestFile(file));
const read = (file: string) => readFileSync(file, "utf8");

function isClientComponent(source: string): boolean {
  const withoutComments = source.replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, "");
  return /^\s*["']use client["']/.test(withoutComments);
}

function hasServerOnlyMarker(source: string): boolean {
  return /^import\s+["']server-only["'];?\s*$/m.test(source);
}

function resolveImport(fromFile: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = path.join(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(fromFile), specifier);
  else return null;
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];
  return (
    candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null
  );
}

/** Runtime imports only: `import type` and `export type` are erased and cannot leak code. */
function runtimeImports(file: string): string[] {
  const source = read(file);
  const specifiers: string[] = [];
  const pattern = /^\s*(?:import|export)\s+(?!type\b)(?:[\s\S]*?\sfrom\s+)?["']([^"']+)["']/gm;
  for (const match of source.matchAll(pattern)) {
    if (match[1]) specifiers.push(match[1]);
  }
  for (const match of source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) {
    if (match[1]) specifiers.push(match[1]);
  }
  return specifiers
    .map((specifier) => resolveImport(file, specifier))
    .filter((resolved): resolved is string => resolved !== null);
}

function reachableFrom(entry: string): Set<string> {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    stack.push(...runtimeImports(file));
  }
  return seen;
}

describe("data-access client boundaries", () => {
  it("marks the server and service-role modules as server-only", () => {
    for (const file of SERVER_ONLY_MODULES) {
      expect(hasServerOnlyMarker(read(file)), path.relative(SRC, file)).toBe(true);
    }
  });

  it("keeps the browser client free of server-only code", () => {
    const reachable = reachableFrom(path.join(DATA, "clients", "browser.ts"));
    const leaked = [...reachable].filter((file) => hasServerOnlyMarker(read(file)));
    expect(leaked.map((file) => path.relative(SRC, file))).toEqual([]);
  });

  it("does not let any Client Component reach a server-only module", () => {
    const clientComponents = sourceFiles.filter((file) => isClientComponent(read(file)));
    expect(clientComponents.length).toBeGreaterThan(0);
    for (const component of clientComponents) {
      const leaked = [...reachableFrom(component)].filter((file) =>
        hasServerOnlyMarker(read(file)),
      );
      expect(
        leaked.map((file) => path.relative(SRC, file)),
        path.relative(SRC, component),
      ).toEqual([]);
    }
  });

  it("reads the service-role key in exactly one server-only module", () => {
    const readers = sourceFiles.filter((file) => read(file).includes("SUPABASE_SERVICE_ROLE_KEY"));
    expect(readers.map((file) => path.relative(DATA, file))).toEqual([
      path.join("clients", "service-config.ts"),
    ]);
    expect(hasServerOnlyMarker(read(readers[0]!))).toBe(true);
  });

  it("never exposes a service-role key through a NEXT_PUBLIC_ variable", () => {
    for (const file of sourceFiles) {
      expect(read(file), path.relative(SRC, file)).not.toMatch(/NEXT_PUBLIC_[A-Z_]*SERVICE/);
    }
  });
});
