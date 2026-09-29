// NFAI Labs Phase 2: acceptance checks through the real Supabase Data API (PostgREST).
//
// Complements remote_checks.sql (which runs inside the database) by checking what a browser
// holding the public anon key can and cannot do over HTTP, that the service-role key works
// from server-side code, and that the service-role key never reaches the browser bundle.
//
// Usage (development project only, after migrations and the synthetic seed are applied, and
// after `npm run build`):
//   node --env-file=.env.local supabase/validation/api_checks.mjs
//
// Reads NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.
// Never prints key values. Writes nothing: every write attempt is expected to be refused.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY (for example in .env.local).",
  );
  process.exit(2);
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const anon = createClient(url, anonKey, options);
const service = createClient(url, serviceKey, options);

const ALPHA = "Test Model Alpha";
const BETA_DRAFT = "Test Model Beta";
const RESULTS = {
  "5eed0000-0000-4000-8000-000000000205": "superseded",
  "5eed0000-0000-4000-8000-000000000206": "published",
  "5eed0000-0000-4000-8000-000000000207": "withdrawn",
};
const PUBLIC_STATES = new Set(["published", "superseded", "withdrawn"]);

const results = [];
function record(name, passed, detail) {
  results.push({ name, passed, detail });
}

async function expectRefused(name, request) {
  const { error } = await request;
  record(
    name,
    Boolean(error),
    error ? `refused (${error.code ?? "error"})` : "SUCCEEDED (should be refused)",
  );
}

// Anonymous reads: only the public record.
{
  const { data, error } = await anon
    .from("model_versions")
    .select("display_name, publication_state");
  const names = (data ?? []).map((r) => r.display_name);
  record(
    "anon reads published Test Model Alpha",
    !error && names.includes(ALPHA),
    error ? error.message : `visible: ${names.join(", ") || "none"}`,
  );
  record("anon cannot read draft Test Model Beta", !error && !names.includes(BETA_DRAFT), "");
  record(
    "anon sees only public states",
    !error && (data ?? []).every((r) => PUBLIC_STATES.has(r.publication_state)),
    "",
  );
}

{
  const { data, error } = await anon
    .from("benchmark_results")
    .select("id, publication_state")
    .in("id", Object.keys(RESULTS));
  const states = Object.fromEntries((data ?? []).map((r) => [r.id, r.publication_state]));
  record(
    "anon sees superseded and withdrawn results as history",
    !error && Object.entries(RESULTS).every(([id, state]) => states[id] === state),
    error ? error.message : JSON.stringify(states),
  );
}

// Anonymous writes and internal data are refused.
await expectRefused(
  "anon insert is refused",
  anon.from("providers").insert({ slug: "api-check-provider", name: "API Check Provider" }),
);
await expectRefused(
  "anon update is refused",
  anon.from("model_versions").update({ display_name: "x" }).eq("display_name", ALPHA).select(),
);
await expectRefused(
  "anon cannot run workflow functions",
  anon.rpc("nfai_transition", {
    p_table: "public.model_versions",
    p_id: "5eed0000-0000-4000-8000-000000000104",
    p_to_state: "withdrawn",
  }),
);
await expectRefused("anon cannot read the audit log", anon.from("audit_log").select("id").limit(1));

// Service role works from server-side code (this process), including unpublished rows.
{
  const { data, error } = await service
    .from("model_versions")
    .select("display_name, publication_state");
  const names = (data ?? []).map((r) => r.display_name);
  record(
    "service role (server-side) reads unpublished rows",
    !error && names.includes(BETA_DRAFT),
    error ? error.message : `visible: ${names.join(", ")}`,
  );
}

// The service-role key must never be in the browser bundle.
{
  const staticDir = join(process.cwd(), ".next", "static");
  let files = [];
  try {
    files = readdirSync(staticDir, { recursive: true })
      .map((f) => join(staticDir, String(f)))
      .filter((f) => statSync(f).isFile() && /\.(js|css|html|json)$/.test(f));
  } catch {
    files = [];
  }
  const leaks = files.filter((f) => {
    const text = readFileSync(f, "utf8");
    return text.includes(serviceKey) || text.includes("SUPABASE_SERVICE_ROLE_KEY");
  });
  record(
    "service-role key absent from browser bundle",
    files.length > 0 && leaks.length === 0,
    files.length === 0
      ? "no .next/static files: run `npm run build` first"
      : `${files.length} files scanned`,
  );
}

let failed = 0;
for (const r of results) {
  if (!r.passed) failed += 1;
  console.log(`${r.passed ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
