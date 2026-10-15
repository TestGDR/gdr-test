"use client";

import { useMemo, useState } from "react";
import HouseTrade from "@/components/houses/HouseTrade";
import { createClient } from "@/lib/supabase/client";

type House = { id: string; name: string; playable: boolean };

// Lo staff gestisce le tratte per conto di una casata (di solito PNG):
// stesse funzioni che i giocatori hanno nel pannello Feudo
export default function TradeManager({ houses, resources }: { houses: House[]; resources: { id: string; name: string; tradable?: boolean }[] }) {
  const supabase = useMemo(() => createClient(), []);
  const npc = houses.filter((h) => !h.playable);
  const pc = houses.filter((h) => h.playable);
  const [house, setHouse] = useState(npc[0]?.id ?? pc[0]?.id ?? "");
  const [session, setSession] = useState(0); // ricarica l'elenco dopo gli scambi
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function runNow() {
    if (!window.confirm("Eseguire adesso gli scambi di tutte le tratte attive? Conta come un mese in più per ogni tratta.")) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("run_trade_routes", { p_force: true });
    setBusy(false);
    setMsg(error ? { ok: false, text: "Scambi non eseguiti." } : { ok: true, text: `Scambi eseguiti: ${data ?? 0}.` });
    if (!error) setSession((s) => s + 1);
  }

  if (houses.length === 0) return <p className="text-muted">Non ci sono ancora casate.</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Scegli la casata per cui agire: puoi proporre tratte a suo nome (a una casata precisa o a tutte), accettare o rifiutare quelle che riceve, annullarle e
        rinnovarle. Le casate PNG non hanno un tesoro da controllare: consegnano sempre quanto pattuito.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-0 flex-1 space-y-1 text-xs tracking-wide text-muted uppercase">
          Agisci per la casata
          <select value={house} onChange={(e) => setHouse(e.target.value)} className="input normal-case">
            {npc.length > 0 && (
              <optgroup label="Casate PNG">
                {npc.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </optgroup>
            )}
            {pc.length > 0 && (
              <optgroup label="Casate PG">
                {pc.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <button type="button" onClick={runNow} disabled={busy} className="btn-ghost px-3 py-2 text-xs" title="Normalmente avviene da solo il primo giorno del mese">
          Esegui ora gli scambi del mese
        </button>
      </div>
      {msg && <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>}
      {house && <HouseTrade key={`${house}-${session}`} houseId={house} canManage resources={resources} />}
    </div>
  );
}
