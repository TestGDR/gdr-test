"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isDue, markDone } from "@/lib/throttle";

type Paid = { pg_name: string; collected: number };

// Stipendio giornaliero: si ritira da solo entrando nel gioco.
// Il database paga una sola volta al giorno, anche se la pagina si ricarica.
// L'avviso "Stipendio ritirato" sparisce da solo dopo 6 secondi.
export default function SalaryCollector({ userId }: { userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [paid, setPaid] = useState<Paid[]>([]);

  // non a ogni caricamento di pagina: al massimo una volta ogni mezz'ora
  useEffect(() => {
    const key = `stipendio:${userId}`;
    if (!isDue(key)) return;
    supabase.rpc("collect_daily_salary").then(({ data, error }) => {
      if (error) return;
      markDone(key);
      if (data?.length) setPaid(data as Paid[]);
    });
  }, [supabase, userId]);

  // l'avviso sparisce da solo dopo qualche secondo
  useEffect(() => {
    if (paid.length === 0) return;
    const t = setTimeout(() => setPaid([]), 6000);
    return () => clearTimeout(t);
  }, [paid]);

  if (paid.length === 0) return null;
  return (
    <div role="status" className="fixed right-4 bottom-4 z-50 max-w-xs rounded-md border border-accent/60 bg-panel px-4 py-3 shadow-2xl shadow-black">
      <div className="flex items-start gap-3">
        <span aria-hidden className="text-2xl">💰</span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-serif text-accent">Stipendio ritirato</p>
          {paid.map((p) => (
            <p key={p.pg_name} className="text-muted">
              {p.pg_name}: <strong className="text-foreground">+{p.collected}</strong> monete sul conto
            </p>
          ))}
        </div>
        <button type="button" onClick={() => setPaid([])} aria-label="Chiudi" className="text-muted hover:text-accent">
          ✕
        </button>
      </div>
    </div>
  );
}
