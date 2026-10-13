import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { supabaseKey, supabaseUrl } from "./env";

// Client Supabase da usare in Server Components, Server Actions e Route Handlers
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Chiamato da un Server Component: i cookie vengono aggiornati dal proxy.
        }
      },
    },
  });
}

// Restituisce client + utente loggato, altrimenti rimanda al login.
// cache(): layout e pagina della stessa richiesta lo chiedono una volta sola
// (una sola verifica della sessione invece di due)
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
});
