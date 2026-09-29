import "server-only";
import { requireHttpUrl, requireValue } from "@/lib/data/clients/config";

/**
 * Service-role settings. The service-role key bypasses Row Level Security, so
 * this module is server-only: importing it from a Client Component is a build
 * error, and it must never be read from a NEXT_PUBLIC_ variable.
 */

type Env = Readonly<Record<string, string | undefined>>;

export type SupabaseServiceConfig = {
  url: string;
  serviceRoleKey: string;
};

export function readSupabaseServiceConfig(env: Env = process.env): SupabaseServiceConfig {
  return {
    url: requireHttpUrl("NEXT_PUBLIC_SUPABASE_URL", env.NEXT_PUBLIC_SUPABASE_URL),
    serviceRoleKey: requireValue("SUPABASE_SERVICE_ROLE_KEY", env.SUPABASE_SERVICE_ROLE_KEY),
  };
}
