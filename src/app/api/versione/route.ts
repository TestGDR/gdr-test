import { NextResponse } from "next/server";

// Versione del sito pubblicata adesso: chi ha la pagina aperta da prima di un
// aggiornamento la confronta con la sua e vede "Aggiorna".
// Statica: il valore e' fissato quando il sito viene pubblicato e Vercel la
// serve come un file, senza far partire una funzione a ogni controllo.
// (Ogni pubblicazione ne crea una nuova con la versione nuova.)
export const dynamic = "force-static";

export function GET() {
  return NextResponse.json({ v: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" });
}
