"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Versione con cui e' stata caricata questa pagina (fissata al momento della pubblicazione)
const MINE = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const EVERY_MS = 10 * 60_000; // al massimo un controllo ogni 10 minuti

// true quando online c'e' una versione piu' nuova di quella aperta: serve ricaricare.
// Si controlla ogni 10 minuti, solo con la scheda in primo piano (tornando sulla
// scheda dopo piu' di 10 minuti si controlla subito).
export function useNewVersion() {
  const [stale, setStale] = useState(false);
  const last = useRef(0);
  const check = useCallback(() => {
    if (MINE === "dev" || stale) return;
    if (document.visibilityState !== "visible" || Date.now() - last.current < EVERY_MS - 5_000) return;
    last.current = Date.now();
    // il parametro evita la copia nel browser; Vercel serve comunque il file statico
    fetch(`/api/versione?t=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { v?: string } | null) => {
        if (d?.v && d.v !== "dev" && d.v !== MINE) setStale(true);
      })
      .catch(() => {});
  }, [stale]);
  useEffect(() => {
    last.current = Date.now(); // appena caricata la pagina e' gia' l'ultima versione
    const t = setInterval(check, EVERY_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", check);
    };
  }, [check]);
  return stale;
}
