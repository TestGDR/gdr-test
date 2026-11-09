import { NextResponse } from "next/server";

// Versione del sito pubblicata adesso: chi ha la pagina aperta da prima di un
// aggiornamento la confronta con la sua e vede "Aggiorna".
// È statica: la prepara il build di ogni pubblicazione (niente chiamate alle funzioni).
export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(
    { v: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
