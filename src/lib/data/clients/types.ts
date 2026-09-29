import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * A client whose reads are limited by Row Level Security to public data (anon
 * key). Repositories accept only this type; they are equally usable from the
 * browser client and the server public client.
 */
export type PublicClient = SupabaseClient<Database>;
