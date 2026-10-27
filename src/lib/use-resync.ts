"use client";

import { useEffect, useRef } from "react";

// Ricontrolla i dati quando gli avvisi in tempo reale possono essersi persi:
// si torna sulla scheda del sito, torna la rete, o comunque ogni tanto mentre
// la pagina e' in primo piano (telefono in standby, scheda in secondo piano,
// collegamento caduto: gli avvisi arrivati nel frattempo non si ripetono).
export function useResync(fn: () => void, everyMs = 180_000) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    let last = Date.now();
    const run = (force = false) => {
      if (document.visibilityState !== "visible") return;
      // al massimo una volta ogni 15 secondi (il "focus" capita spesso)
      if (!force && Date.now() - last < 15_000) return;
      last = Date.now();
      ref.current();
    };
    const onVisible = () => run();
    const onOnline = () => run(true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onOnline);
    const t = setInterval(() => run(true), everyMs);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onOnline);
      clearInterval(t);
    };
  }, [everyMs]);
}
