import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./env";

// Client con la SECRET KEY: ignora le RLS. Solo codice server, mai nel browser.
// Da usare esclusivamente per operazioni che l'utente non deve poter fare da solo
// (es. scrivere nel registro accessi).
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) return null;
  return createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
