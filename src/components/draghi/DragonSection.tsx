"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { dragonName, type Dragon, type DragonStage } from "@/lib/dragons";
import { createClient } from "@/lib/supabase/client";
import DragonCard, { DragonPortrait } from "./DragonCard";

type Data = { stages: DragonStage[]; dragon: Dragon | null; px: number };

// Scheda del personaggio: il suo drago, oppure il suo uovo (che solo lui puo' schiudere)
export default function DragonSection({
  characterId,
  characterName,
  isOwn,
}: {
  characterId: string;
  characterName: string;
  isOwn: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchAll = useCallback(async (): Promise<Data> => {
    const [stages, dragon, me] = await Promise.all([
      supabase.from("dragon_stages").select("*").order("sort_order"),
      supabase.from("dragons").select("*").eq("rider_id", characterId).maybeSingle(),
      isOwn ? supabase.from("characters").select("px").eq("id", characterId).single() : Promise.resolve({ data: null }),
    ]);
    return {
      stages: (stages.data ?? []) as DragonStage[],
      dragon: (dragon.data ?? null) as Dragon | null,
      px: (me.data as { px: number } | null)?.px ?? 0,
    };
  }, [supabase, characterId, isOwn]);

  const reload = useCallback(() => fetchAll().then(setData), [fetchAll]);
  useEffect(() => {
    fetchAll().then(setData);
  }, [fetchAll]);

  async function hatch(egg: Dragon) {
    if (!window.confirm("Far schiudere il tuo uovo? Nascerà un drago neonato con caratteristiche estratte a caso.")) return;
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.rpc("hatch_egg", { p_dragon: egg.id });
    setBusy(false);
    setMessage(error ? error.message : "L'uovo si è schiuso! Ora puoi dare un nome al tuo drago.");
    reload();
  }

  if (!data) return null;
  const { dragon } = data;

  return (
    <section className="space-y-3">
      <h4 className="font-serif text-accent">{dragon?.status === "uovo" ? "Uovo di drago" : "Drago"}</h4>
      {!dragon ? (
        <p className="text-sm text-muted">{isOwn ? "Non hai un uovo né un drago." : "Nessun drago."}</p>
      ) : dragon.status === "uovo" ? (
        <div className="flex items-center gap-4 border border-border bg-black/40 p-3">
          <DragonPortrait dragon={dragon} size="h-20 w-20" />
          <div className="space-y-2">
            <p className="font-serif">{dragonName(dragon)}</p>
            <p className="text-sm text-muted">
              {isOwn ? "Non si è ancora schiuso. Quando nascerà potrai dargli un nome." : `L'uovo di ${characterName} non si è ancora schiuso.`}
            </p>
            {isOwn && (
              <button type="button" onClick={() => hatch(dragon)} disabled={busy} className="btn px-4 py-1.5 text-sm">
                {busy ? "..." : "Schiudi"}
              </button>
            )}
          </div>
        </div>
      ) : (
        <DragonCard
          dragon={dragon}
          stages={data.stages}
          riderName={characterName}
          rider={isOwn ? { px: data.px } : null}
          onChanged={reload}
        />
      )}
      {message && <p className="text-sm text-[#e8cf9c]">{message}</p>}
    </section>
  );
}
