import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Chiamato dal browser mentre il giocatore chiude il sito (navigator.sendBeacon):
// il suo "ultimo segnale" viene spento e sparisce subito dall'elenco dei presenti.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await supabase.rpc("leave_online");
  return new NextResponse(null, { status: 204 });
}
