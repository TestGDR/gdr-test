import { NextResponse } from "next/server";

// Versione del sito pubblicata adesso: chi ha la pagina aperta da prima di un
// aggiornamento la confronta con la sua e vede "Aggiorna"
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { v: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
