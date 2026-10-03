"use client";

import { useEffect, useMemo, useState } from "react";
import { colorLabel, dragonName, stageLabel, type Dragon, type DragonStage } from "@/lib/dragons";
import { createClient } from "@/lib/supabase/client";
import DragonCard, { DragonPortrait } from "./DragonCard";

type Data = { dragons: Dragon[]; stages: DragonStage[]; riders: Record<string, string> };

// Pagina della casata: draghi e uova (cliccando un drago si apre la sua scheda)
export default function HouseDragons({ houseId }: { houseId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<Data | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from("dragons").select("*").eq("house_id", houseId).order("created_at"),
      supabase.from("dragon_stages").select("*").order("sort_order"),
    ]).then(async ([d, s]) => {
      const dragons = (d.data ?? []) as Dragon[];
      const ids = dragons.flatMap((x) => (x.rider_id ? [x.rider_id] : []));
      const { data: riders } = ids.length ? await supabase.from("characters").select("id, name").in("id", ids) : { data: [] };
      setData({
        dragons,
        stages: (s.data ?? []) as DragonStage[],
        riders: Object.fromEntries((riders ?? []).map((r) => [r.id, r.name])),
      });
    });
  }, [supabase, houseId]);

  if (!data) return <p className="text-sm text-muted">Caricamento...</p>;
  const grown = data.dragons.filter((d) => d.status === "drago");
  const eggs = data.dragons.filter((d) => d.status === "uovo");
  const open = grown.find((d) => d.id === openId);

  if (data.dragons.length === 0) return <p className="text-sm text-muted">La casata non ha draghi.</p>;
  return (
    <div className="space-y-4">
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {grown.map((d) => (
          <li key={d.id}>
            <button
              type="button"
              onClick={() => setOpenId(d.id === openId ? null : d.id)}
              aria-expanded={d.id === openId}
              className={`flex w-full items-center gap-3 border px-3 py-2 text-left transition hover:border-accent ${
                d.id === openId ? "border-accent bg-blood/15" : "border-border bg-black/40"
              }`}
            >
              <DragonPortrait dragon={d} size="h-12 w-12" />
              <span className="min-w-0">
                <span className="block truncate font-serif text-accent">{dragonName(d)}</span>
                <span className="block text-xs text-muted">
                  {stageLabel(d.stage, data.stages)} · {colorLabel(d)}
                </span>
                <span className="block text-xs text-muted">Cavaliere: {d.rider_id ? data.riders[d.rider_id] : "nessuno"}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {eggs.length > 0 && (
        <p className="text-sm text-muted">
          Uova: <strong className="text-foreground">{eggs.length}</strong> in attesa di schiudersi.
        </p>
      )}
      {open && <DragonCard dragon={open} stages={data.stages} riderName={open.rider_id ? data.riders[open.rider_id] : null} />}
    </div>
  );
}
