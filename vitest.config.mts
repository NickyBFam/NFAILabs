import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const alias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
  // `server-only` throws outside the react-server condition. Next.js enforces the
  // boundary at build time; unit tests import server modules directly, so they get a
  // no-op stand-in. See docs/DATABASE.md.
  "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
};

const DB_TESTS = "src/**/*.db.test.{ts,tsx}";

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    globals: false,
    css: false,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          setupFiles: ["./src/test/setup.ts"],
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: [DB_TESTS],
        },
      },
      {
        extends: true,
        test: {
          // Database tests run real SQL (all migrations) in an in-process PGlite
          // PostgreSQL instance. No network, Docker, or credentials are required.
          name: "db",
          environment: "node",
          include: [DB_TESTS],
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
