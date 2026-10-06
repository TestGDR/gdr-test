"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logoutIdle } from "@/app/(pubblico)/login/actions";

// Uscita automatica dopo 60 minuti di inattivita'.
// Conta come attivita': muovere il mouse, cliccare, scrivere, usare la rotellina,
// toccare lo schermo, cambiare pagina, aprire finestre (che e' sempre un clic).
// Le schede aperte contano insieme: l'ultima attivita' sta nel browser
// (localStorage), cosi' chi gioca in una scheda non viene buttato fuori dall'altra.
export const IDLE_MS = 60 * 60 * 1000;
export const WARN_MS = 55 * 60 * 1000; // avviso 5 minuti prima
const KEY = "westeros-ultima-attivita";
const EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "wheel",
  "touchstart",
  "pointerdown",
  "scroll",
] as const;

function readLast() {
  try {
    const n = Number(localStorage.getItem(KEY));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}
function writeLast(t: number) {
  try {
    localStorage.setItem(KEY, String(t));
  } catch {
    // senza localStorage vale solo questa scheda
  }
}

// Restituisce i minuti che mancano all'uscita quando si e' nella fascia di
// avviso (altrimenti null) e la funzione per restare collegati
export function useIdleLogout() {
  const pathname = usePathname();
  const last = useRef(0);
  const leaving = useRef(false);
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null);

  // Attivita': si segna subito in questa scheda, nel browser al massimo ogni 15 secondi
  const touch = useRef(() => {
    const now = Date.now();
    if (now - last.current > 15_000) writeLast(now);
    last.current = now;
  });

  useEffect(() => {
    // All'apertura: se l'ultima attivita' nel browser e' di oltre un'ora fa,
    // la sessione era gia' scaduta
    const stored = readLast();
    if (stored && Date.now() - stored >= IDLE_MS) {
      leaving.current = true;
      logoutIdle();
      return;
    }
    const mark = touch.current;
    mark();
    for (const e of EVENTS)
      window.addEventListener(e, mark, { passive: true, capture: true });

    const check = setInterval(() => {
      if (leaving.current) return;
      const idle = Date.now() - Math.max(last.current, readLast());
      if (idle >= IDLE_MS) {
        leaving.current = true;
        logoutIdle();
      } else if (idle >= WARN_MS) {
        setMinutesLeft(Math.max(1, Math.ceil((IDLE_MS - idle) / 60_000)));
      } else {
        setMinutesLeft(null);
      }
    }, 10_000);

    return () => {
      for (const e of EVENTS)
        window.removeEventListener(e, mark, { capture: true });
      clearInterval(check);
    };
  }, []);

  // cambiare pagina e' attivita'
  useEffect(() => {
    touch.current();
  }, [pathname]);

  return {
    minutesLeft,
    stay: () => {
      touch.current();
      writeLast(Date.now());
      setMinutesLeft(null);
    },
  };
}
