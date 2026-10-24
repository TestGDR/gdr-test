"use client";

import { useEffect, useMemo, useState } from "react";
import { colorLabel, dragonName, stageLabel, type Dragon, type DragonStage } from "@/lib/dragons";
import { createClient } from "@/lib/supabase/client";
import DragonCard, { DragonPortrait } from "./DragonCard";

type Data = { dragons: Dragon[]; stages: DragonStage[]; riders: Record<string, string>; houses: Record<string, string> };

// Utility: anagrafe di tutti i draghi del gioco (cliccando un drago si apre la sua scheda)
export default function DragonRegistry() {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<Data | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    Promise.all([
      supabase.from("dragons").select("*").eq("status", "drago").order("name"),
      supabase.from("dragon_stages").select("*").order("sort_order"),
      supabase.from("houses").select("id, name"),
    ]).then(async ([d, s, h]) => {
      const dragons = (d.data ?? []) as Dragon[];
      const ids = dragons.flatMap((x) => (x.rider_id ? [x.rider_id] : []));
      const npcIds = dragons.flatMap((x) => (x.npc_rider_id ? [x.npc_rider_id] : []));
      const [{ data: riders }, { data: npcRiders }] = await Promise.all([
        ids.length ? supabase.from("characters").select("id, name").in("id", ids) : Promise.resolve({ data: [] }),
        npcIds.length ? supabase.from("house_npcs").select("id, name").in("id", npcIds) : Promise.resolve({ data: [] }),
      ]);
      setData({
        dragons,
        stages: (s.data ?? []) as DragonStage[],
        riders: Object.fromEntries([
          ...(riders ?? []).map((r) => [r.id, r.name]),
          ...(npcRiders ?? []).map((n) => [n.id, `${n.name} (PNG)`]),
        ]),
        houses: Object.fromEntries((h.data ?? []).map((x) => [x.id, x.name])),
      });
    });
  }, [supabase]);

  if (!data) return <p className="text-muted">Caricamento...</p>;
  const rider = (d: Dragon) => data.riders[d.rider_id ?? d.npc_rider_id ?? ""] ?? null;
  const q = query.trim().toLowerCase();
  const list = data.dragons.filter(
    (d) =>
      !q ||
      dragonName(d).toLowerCase().includes(q) ||
      (rider(d) ?? "").toLowerCase().includes(q) ||
      (data.houses[d.house_id ?? ""] ?? "").toLowerCase().includes(q),
  );
  const open = data.dragons.find((d) => d.id === openId);

  if (open)
    return (
      <div className="space-y-3">
        <button type="button" onClick={() => setOpenId(null)} className="text-sm text-muted hover:text-accent">
          ← Anagrafe draghi
        </button>
        <DragonCard dragon={open} stages={data.stages} riderName={rider(open)} />
      </div>
    );

  return (
    <div className="space-y-4">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cerca un drago, un cavaliere o una casata..."
        className="input"
      />
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((d) => (
          <li key={d.id}>
            <button
              type="button"
              onClick={() => setOpenId(d.id)}
              className="flex w-full items-center gap-3 border border-border bg-black/40 px-3 py-2 text-left transition hover:border-accent"
            >
              <DragonPortrait dragon={d} size="h-12 w-12" />
              <span className="min-w-0">
                {/* tutto per intero: le righe vanno a capo invece di essere tagliate */}
                <span className="block font-serif leading-tight break-words text-accent">{dragonName(d)}</span>
                <span className="block text-xs text-muted">
                  {stageLabel(d.stage, data.stages)} · {colorLabel(d)}
                </span>
                <span className="block text-xs break-words text-muted">
                  {d.house_id && data.houses[d.house_id] ? `Casata ${data.houses[d.house_id]}` : "Senza casata"}
                </span>
                <span className="block text-xs break-words text-muted">
                  Cavaliere: <span className="text-foreground">{rider(d) ?? "nessuno"}</span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {list.length === 0 && <p className="text-muted">Nessun drago trovato.</p>}
    </div>
  );
}
