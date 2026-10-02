"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Paid = { pg_name: string; collected: number };

// Stipendio giornaliero: si ritira da solo entrando nel gioco.
// Il database paga una sola volta al giorno, anche se la pagina si ricarica.
export default function SalaryCollector() {
  const supabase = useMemo(() => createClient(), []);
  const [paid, setPaid] = useState<Paid[]>([]);

  useEffect(() => {
    supabase.rpc("collect_daily_salary").then(({ data }) => {
      if (data?.length) setPaid(data as Paid[]);
    });
  }, [supabase]);

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
