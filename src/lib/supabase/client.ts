import { createBrowserClient } from "@supabase/ssr";
import { supabaseKey, supabaseUrl } from "./env";

// Client Supabase da usare nei Client Components (browser)
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseKey);
}
