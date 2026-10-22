"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Resource = { id: string; name: string; tradable?: boolean };
type Prices = { buy: number; sell: number; limit: number };

const romeMonth = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date()).slice(0, 7) + "-01";

// Mercato PNG di emergenza: si compra caro e si vende poco, con un tetto
// al mese per risorsa. Serve per le emergenze, non sostituisce le tratte.
export default function NpcMarket({
  houseId,
  canManage,
  resources,
  onChanged,
}: {
  houseId: string;
  canManage: boolean;
  resources: Resource[];
  onChanged?: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [prices, setPrices] = useState<Prices | null>(null);
  const [used, setUsed] = useState<Record<string, { bought: number; sold: number }>>({});
  const goods = resources.filter((r) => r.tradable !== false && r.name.toLowerCase() !== "oro");
  const [resId, setResId] = useState("");
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const [s, u] = await Promise.all([
      supabase.from("economy_settings").select("npc_buy_price, npc_sell_price, npc_monthly_limit").maybeSingle(),
      supabase.from("npc_market_usage").select("resource_id, bought, sold").eq("house_id", houseId).eq("month", romeMonth()),
    ]);
    // migrazione 0156 non ancora eseguita: il riquadro non compare
    if (s.error || !s.data) return setPrices(null);
    setPrices({ buy: Number(s.data.npc_buy_price), sell: Number(s.data.npc_sell_price), limit: Number(s.data.npc_monthly_limit) });
    setUsed(Object.fromEntries((u.data ?? []).map((x) => [x.resource_id as string, { bought: Number(x.bought), sold: Number(x.sold) }])));
  }, [supabase, houseId]);
  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  if (!prices || goods.length === 0) return null;
  const res = goods.find((r) => r.id === resId) ?? goods[0];
  const n = Math.floor(Number(qty));
  const valid = Number.isFinite(n) && n >= 1;
  const u = used[res.id] ?? { bought: 0, sold: 0 };
  const fmt = (x: number) => x.toLocaleString("it-IT");

  async function trade(buy: boolean) {
    const cost = buy ? Math.ceil(n * prices!.buy) : Math.floor(n * prices!.sell);
    if (!window.confirm(buy ? `Comprare ${n} ${res.name} per ${cost} Oro?` : `Vendere ${n} ${res.name} per ${cost} Oro?`)) return;
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase.rpc("npc_market_trade", { p_house: houseId, p_resource: res.id, p_qty: n, p_buy: buy });
    setBusy(false);
    setMsg(error ? { ok: false, text: error.message.length < 160 ? error.message : "Operazione non riuscita." } : { ok: true, text: String(data) });
    if (!error) {
      setQty("");
      load();
      onChanged?.();
    }
  }

  return (
    <section className="space-y-2 border border-border/60 bg-black/30 p-3">
      <h3 className="font-serif text-lg text-accent">Mercato dei PNG</h3>
      <p className="text-xs text-muted">
        Per le emergenze: si compra a {fmt(prices.buy)} Oro l&apos;unità e si vende a {fmt(prices.sell)} Oro, al massimo {fmt(prices.limit)} unità
        al mese per risorsa. Costa sempre più delle tratte con le altre casate.
      </p>
      {canManage ? (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Risorsa</span>
              <select value={res.id} onChange={(e) => setResId(e.target.value)} className="input w-auto! py-1 text-sm">
                {goods.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Quantità</span>
              <input type="number" min={1} max={prices.limit} value={qty} onChange={(e) => setQty(e.target.value)} className="input w-24! py-1 text-sm" />
            </label>
            <button type="button" disabled={busy || !valid} onClick={() => trade(true)} className="btn px-3 py-1.5 text-xs">
              Compra{valid ? ` (${fmt(Math.ceil(n * prices.buy))} Oro)` : ""}
            </button>
            <button type="button" disabled={busy || !valid} onClick={() => trade(false)} className="btn-ghost px-3 py-1.5 text-xs">
              Vendi{valid ? ` (+${fmt(Math.floor(n * prices.sell))} Oro)` : ""}
            </button>
          </div>
          <p className="text-xs text-muted">
            Questo mese, per {res.name}: comprati {fmt(u.bought)}/{fmt(prices.limit)}, venduti {fmt(u.sold)}/{fmt(prices.limit)}.
          </p>
        </>
      ) : (
        <p className="text-xs text-muted">Al mercato tratta chi nella casata gestisce le risorse (es. il signore).</p>
      )}
      {msg && <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>}
    </section>
  );
}
