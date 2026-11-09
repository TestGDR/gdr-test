import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // versione pubblicata (su Vercel il codice del commit): serve all'avviso "Aggiorna"
  env: { NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" },
  experimental: {
    // Le pagine viste negli ultimi 30 secondi si riusano dalla memoria del browser
    // (solo di quel giocatore, non condivisa) invece di richiederle al server:
    // meno chiamate a Vercel. "Aggiorna" e i salvataggi la saltano.
    staleTimes: { dynamic: 30 },
    serverActions: {
      // Caricamento di immagini (stemmi e ritratti fino a 1 MB, documentazione
      // fino a 2 MB, mappe fino a 5 MB) + dati del modulo
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
