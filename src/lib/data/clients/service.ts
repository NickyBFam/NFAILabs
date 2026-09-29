import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseServiceConfig } from "@/lib/data/clients/service-config";
import type { Database } from "@/types/database";

/**
 * Privileged service-role client. The service-role key BYPASSES Row Level
 * Security and can read drafts, internal records, and audit data.
 *
 * - Server-only: `import "server-only"` makes importing this module from a
 *   Client Component a build error, and a test guards against it.
 * - Never pass it, or data read with it, to public pages without applying the
 *   published-only rules in `@/lib/data/queries`.
 * - Phase 2 has no caller. It is reserved for Phase 3 admin and future workers.
 */

export type ServiceClient = SupabaseClient<Database>;

export function createServiceClient(): ServiceClient {
  const { url, serviceRoleKey } = readSupabaseServiceConfig();
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
