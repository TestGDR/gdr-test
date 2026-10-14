"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { housePower, type FiefPoints, type HouseTroop, type Matchup, type TroopType } from "@/lib/armies";
import { createClient } from "@/lib/supabase/client";

type Data = {
  types: TroopType[];
  matchups: Matchup[];
  troops: HouseTroop[];
  kingdom: string | null;
  called: boolean | null; // null: migrazione 0143 non ancora eseguita
  upkeep: { resource_id: string; army: number }[];
};

const num = (n: number) => n.toLocaleString("it-IT");
const signed = (n: number) => (n > 0 ? `+${num(n)}` : num(n));

// Esercito e potenza della casata (pannello Feudi): lo vedono i membri.
// Chi comanda (ruolo che gestisce le risorse) lo richiama o lo congeda:
// richiamato paga tutto il mantenimento, congedato un quarto (e conta comunque)
export default function HouseArmy({
  houseId,
  fief,
  canCommand = false,
  resources = [],
  onChanged,
}: {
  houseId: string;
  fief: FiefPoints;
  canCommand?: boolean;
  resources?: { id: string; name: string }[];
  onChanged?: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const [t, m, h, k, house, up] = await Promise.all([
      supabase.from("troop_types").select("*").order("sort_order").order("name"),
      supabase.from("troop_matchups").select("*"),
      supabase.from("house_troops").select("*").eq("house_id", houseId),
      supabase.from("house_kingdoms").select("kingdom:kingdoms(name)").eq("house_id", houseId).maybeSingle(),
      supabase.from("houses").select("army_called").eq("id", houseId).maybeSingle(),
      supabase.rpc("house_upkeep", { p_house: houseId }),
    ]);
    // tabelle non ancora create: il riquadro non compare
    if (t.error) return;
    setData({
      types: (t.data ?? []) as TroopType[],
      matchups: (m.data ?? []) as Matchup[],
      troops: (h.data ?? []) as HouseTroop[],
      kingdom: (k.data?.kingdom as unknown as { name: string } | null)?.name ?? null,
      called: house.error ? null : !!house.data?.army_called,
      upkeep: ((up.data ?? []) as { resource_id: string; army: number }[]).filter((u) => u.army > 0),
    });
  }, [supabase, houseId]);
  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  if (!data) return null;
  const power = housePower(data.troops, data.types, fief);
  const against = (id: string) =>
    data.matchups
      .filter((m) => m.troop_type_id === id)
      .map((m) => `${signed(m.modifier)} contro ${data.types.find((x) => x.id === m.against_id)?.name ?? "?"}`)
      .join(", ");
  const resName = (id: string) => resources.find((r) => r.id === id)?.name ?? "?";

  async function toggle(called: boolean) {
    if (
      !window.confirm(
        called
          ? "Richiamare l'esercito? Da adesso ogni mese paga tutto il suo mantenimento."
          : "Congedare l'esercito? Pagherà un quarto del mantenimento e conterà comunque nella potenza.",
      )
    )
      return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc("set_army_called", { p_house: houseId, p_called: called });
    setBusy(false);
    setMsg(error ? { ok: false, text: error.message.length < 160 ? error.message : "Operazione non riuscita." } : { ok: true, text: called ? "Esercito richiamato." : "Esercito congedato." });
    if (!error) {
      load();
      onChanged?.();
    }
  }

  return (
    <section className="space-y-3">
      <h3 className="font-serif text-xl tracking-wide text-accent">
        Esercito e potenza
        {data.kingdom && <span className="ml-2 text-sm text-muted">· {data.kingdom}</span>}
      </h3>
      {data.called !== null && (
        <div className="flex flex-wrap items-center gap-3 border border-border/60 bg-black/30 px-3 py-2 text-sm">
          <span>
            Stato:{" "}
            <strong className={data.called ? "text-red-300" : "text-muted"}>{data.called ? "Richiamato alle armi" : "Congedato"}</strong>
          </span>
          <span className="text-xs text-muted">
            {data.upkeep.length
              ? `Mantenimento al mese: ${data.upkeep.map((u) => `${num(u.army)} ${resName(u.resource_id)}`).join(", ")}`
              : "Nessun mantenimento al mese."}
            {!data.called && " (un quarto, finché è congedato)"}
          </span>
          {canCommand && (
            <button
              type="button"
              disabled={busy}
              onClick={() => toggle(!data.called)}
              className={`ml-auto px-3 py-1 text-xs ${data.called ? "btn-ghost" : "btn"}`}
            >
              {data.called ? "Congeda l'esercito" : "Richiama l'esercito"}
            </button>
          )}
        </div>
      )}
      {msg && <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>}
      {power.lines.length === 0 ? (
        <p className="text-sm text-muted">La casata non ha truppe.</p>
      ) : (
        <ul className="divide-y divide-border/50 border border-border/60">
          {power.lines.map((l) => (
            <li key={l.type.id} className="flex flex-wrap items-baseline gap-x-3 px-3 py-2 text-sm">
              <span className="font-serif">
                {num(l.quantity)} × {l.type.name}
              </span>
              <span className="text-xs text-muted">
                attacco {num(l.attack)} · difesa {num(l.defense)}
              </span>
              {against(l.type.id) && <span className="w-full text-xs text-muted">{against(l.type.id)}</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm">
        Truppe <strong>{num(power.army)}</strong> + feudi <strong>{num(power.fief)}</strong> = potenza{" "}
        <strong className="text-accent">{num(power.total)}</strong>
      </p>
    </section>
  );
}
