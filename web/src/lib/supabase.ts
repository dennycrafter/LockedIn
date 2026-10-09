import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only Supabase client (SPEC 4): the browser never talks to Supabase,
// every call happens in API routes with the service role key.
export function createServiceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
