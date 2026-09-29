import { DataAccessError } from "@/lib/data/errors";

/**
 * Supabase connection settings (browser-safe). Only NEXT_PUBLIC_ values live
 * here; the service-role key is read exclusively in `service-config.ts`.
 *
 * Next.js inlines NEXT_PUBLIC_ variables only where `process.env.NAME` is
 * written literally, so the default env object below names each variable
 * explicitly instead of passing `process.env` through.
 */

type Env = Readonly<Record<string, string | undefined>>;

export type SupabasePublicConfig = {
  url: string;
  anonKey: string;
};

function publicEnv(): Env {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

/** Validates an http(s) URL without echoing the value into error messages. */
export function requireHttpUrl(name: string, value: string | undefined): string {
  if (!value) {
    throw new DataAccessError("configuration", `${name} is not set`);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new DataAccessError("configuration", `${name} is not a valid URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new DataAccessError("configuration", `${name} must be an http(s) URL`);
  }
  return value;
}

export function requireValue(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new DataAccessError("configuration", `${name} is not set`);
  }
  return value;
}

export function readSupabasePublicConfig(env: Env = publicEnv()): SupabasePublicConfig {
  return {
    url: requireHttpUrl("NEXT_PUBLIC_SUPABASE_URL", env.NEXT_PUBLIC_SUPABASE_URL),
    anonKey: requireValue("NEXT_PUBLIC_SUPABASE_ANON_KEY", env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  };
}
