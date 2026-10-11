"use client";

import { useEffect, useMemo, useState } from "react";
import { housePower, type FiefPoints, type HouseTroop, type Matchup, type TroopType } from "@/lib/armies";
import { createClient } from "@/lib/supabase/client";

type Data = { types: TroopType[]; matchups: Matchup[]; troops: HouseTroop[]; kingdom: string | null };

const num = (n: number) => n.toLocaleString("it-IT");
const signed = (n: number) => (n > 0 ? `+${num(n)}` : num(n));

// Esercito e potenza della casata (pannello Feudi): lo vedono i membri
export default function HouseArmy({ houseId, fief }: { houseId: string; fief: FiefPoints }) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from("troop_types").select("*").order("sort_order").order("name"),
      supabase.from("troop_matchups").select("*"),
      supabase.from("house_troops").select("*").eq("house_id", houseId),
      supabase.from("house_kingdoms").select("kingdom:kingdoms(name)").eq("house_id", houseId).maybeSingle(),
    ]).then(([t, m, h, k]) => {
      // tabelle non ancora create: il riquadro non compare
      if (t.error) return;
      setData({
        types: (t.data ?? []) as TroopType[],
        matchups: (m.data ?? []) as Matchup[],
        troops: (h.data ?? []) as HouseTroop[],
        kingdom: (k.data?.kingdom as unknown as { name: string } | null)?.name ?? null,
      });
    });
  }, [supabase, houseId]);

  if (!data) return null;
  const power = housePower(data.troops, data.types, fief);
  const against = (id: string) =>
    data.matchups
      .filter((m) => m.troop_type_id === id)
      .map((m) => `${signed(m.modifier)} contro ${data.types.find((x) => x.id === m.against_id)?.name ?? "?"}`)
      .join(", ");

  return (
    <section className="mt-6 space-y-3 border-t border-border pt-5">
      <h3 className="font-serif text-xl tracking-wide text-accent">
        Esercito e potenza
        {data.kingdom && <span className="ml-2 text-sm text-muted">· {data.kingdom}</span>}
      </h3>
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
