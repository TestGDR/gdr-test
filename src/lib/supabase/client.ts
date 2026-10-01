import { createBrowserClient } from "@supabase/ssr";
import { supabaseKey, supabaseUrl } from "./env";

// Client Supabase da usare nei Client Components (browser)
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseKey, {
    // Il controllo periodico della connessione in tempo reale gira in un Web Worker:
    // il browser non lo rallenta quando la scheda e' in secondo piano, quindi la
    // connessione (presenti, messaggi) non cade
    realtime: { worker: true },
  });
}
