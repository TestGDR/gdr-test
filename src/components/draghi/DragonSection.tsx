"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { dragonName, type Dragon, type DragonStage } from "@/lib/dragons";
import { createClient } from "@/lib/supabase/client";
import DragonCard, { DragonPortrait } from "./DragonCard";

type Data = { stages: DragonStage[]; dragon: Dragon | null; eggs: Dragon[]; px: number };

// Scheda del personaggio: il suo drago e (solo per il proprietario) le uova della casata
export default function DragonSection({
  characterId,
  characterName,
  houseId,
  isOwn,
}: {
  characterId: string;
  characterName: string;
  houseId: string | null;
  isOwn: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const fetchAll = useCallback(async (): Promise<Data> => {
    const [stages, dragon, eggs, me] = await Promise.all([
      supabase.from("dragon_stages").select("*").order("sort_order"),
      supabase.from("dragons").select("*").eq("rider_id", characterId).maybeSingle(),
      isOwn && houseId
        ? supabase.from("dragons").select("*").eq("house_id", houseId).eq("status", "uovo").order("created_at")
        : Promise.resolve({ data: [] }),
      isOwn ? supabase.from("characters").select("px").eq("id", characterId).single() : Promise.resolve({ data: null }),
    ]);
    return {
      stages: (stages.data ?? []) as DragonStage[],
      dragon: (dragon.data ?? null) as Dragon | null,
      eggs: (eggs.data ?? []) as Dragon[],
      px: (me.data as { px: number } | null)?.px ?? 0,
    };
  }, [supabase, characterId, houseId, isOwn]);

  const reload = useCallback(() => fetchAll().then(setData), [fetchAll]);
  useEffect(() => {
    fetchAll().then(setData);
  }, [fetchAll]);

  async function hatch(egg: Dragon) {
    if (!window.confirm("Far schiudere questo uovo? Nascerà un drago neonato con caratteristiche estratte a caso.")) return;
    setBusy(egg.id);
    setMessage(null);
    const { error } = await supabase.rpc("hatch_egg", { p_dragon: egg.id });
    setBusy(null);
    setMessage(error ? error.message : "L'uovo si è schiuso! Il neonato ora fa parte dei draghi della casata.");
    reload();
  }

  if (!data) return null;
  if (!data.dragon && data.eggs.length === 0 && !isOwn) return null;

  return (
    <section className="space-y-3">
      <h4 className="font-serif text-accent">Drago</h4>
      {isOwn && <p className="text-xs text-muted">PX disponibili: <strong className="text-foreground">{data.px}</strong></p>}
      {data.dragon ? (
        <DragonCard
          dragon={data.dragon}
          stages={data.stages}
          riderName={characterName}
          rider={isOwn ? { px: data.px } : null}
          onChanged={reload}
        />
      ) : (
        <p className="text-sm text-muted">{isOwn ? "Non sei il cavaliere di nessun drago." : "Nessun drago."}</p>
      )}

      {data.eggs.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-xs tracking-wider text-muted uppercase">Uova della casata</h5>
          <ul className="flex flex-wrap gap-3">
            {data.eggs.map((egg) => (
              <li key={egg.id} className="flex items-center gap-3 border border-border bg-black/40 p-2">
                <DragonPortrait dragon={egg} size="h-14 w-14" />
                <div className="space-y-1">
                  <p className="font-serif text-sm">{dragonName(egg)}</p>
                  <button type="button" onClick={() => hatch(egg)} disabled={busy !== null} className="btn px-3 py-1 text-xs">
                    {busy === egg.id ? "..." : "Schiudi"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {message && <p className="text-sm text-[#e8cf9c]">{message}</p>}
    </section>
  );
}
