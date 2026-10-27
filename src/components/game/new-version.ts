"use client";

import { useCallback, useState } from "react";
import { useResync } from "@/lib/use-resync";

// Versione con cui e' stata caricata questa pagina (fissata al momento della pubblicazione)
const MINE = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

// true quando online c'e' una versione piu' nuova di quella aperta: serve ricaricare
export function useNewVersion() {
  const [stale, setStale] = useState(false);
  const check = useCallback(() => {
    if (MINE === "dev" || stale) return;
    fetch("/api/versione", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { v?: string } | null) => {
        if (d?.v && d.v !== "dev" && d.v !== MINE) setStale(true);
      })
      .catch(() => {});
  }, [stale]);
  useResync(check, 600_000); // al ritorno sulla scheda e ogni 10 minuti
  return stale;
}
