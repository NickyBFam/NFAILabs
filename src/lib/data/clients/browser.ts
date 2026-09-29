import { createClient } from "@supabase/supabase-js";
import { readSupabasePublicConfig } from "@/lib/data/clients/config";
import type { PublicClient } from "@/lib/data/clients/types";
import type { Database } from "@/types/database";

/**
 * Browser-safe public client. Uses only the anon key, so every read is limited
 * by Row Level Security to published data. Phase 2 has no authentication, so
 * no session is persisted.
 *
 * Public pages are Server Components (docs/ARCHITECTURE.md §3.1); prefer the
 * repositories in `@/lib/data/repositories` via `createServerPublicClient`.
 * This client exists for future interactive tools that must read in the browser.
 */

let browserClient: PublicClient | undefined;

export function getBrowserPublicClient(): PublicClient {
  if (!browserClient) {
    const { url, anonKey } = readSupabasePublicConfig();
    browserClient = createClient<Database>(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return browserClient;
}
