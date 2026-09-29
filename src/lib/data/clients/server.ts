import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { PublicClient } from "@/lib/data/clients/types";
import { readSupabasePublicConfig } from "@/lib/data/clients/config";
import type { Database } from "@/types/database";

/**
 * Server-side public client for Server Components and route handlers. It uses
 * the anon key, so Row Level Security still limits it to published data; it
 * carries no user session because Phase 2 has no authentication.
 *
 * A new client per call keeps requests isolated; the client holds no state
 * worth sharing.
 */
export function createServerPublicClient(): PublicClient {
  const { url, anonKey } = readSupabasePublicConfig();
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
