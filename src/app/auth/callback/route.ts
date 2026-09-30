import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Link ricevuti via email (conferma iscrizione, recupero password):
// scambia il codice con una sessione e porta alla pagina indicata in ?next=
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/personaggi";
  // Solo percorsi interni al sito, mai redirect verso altri domini
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/personaggi";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`);
  }

  return NextResponse.redirect(`${origin}/login?errore=link`);
}
