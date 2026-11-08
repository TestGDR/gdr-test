"use client";

import { useCallback, useMemo } from "react";
import type { CountersApi } from "@/components/game/counters";
import { createClient } from "@/lib/supabase/client";
import type { NewsKind } from "./NewsPanel";

// Notizie ON e OFF pubblicate dopo l'ultima volta che il giocatore ha aperto il
// pannello: l'icona cambia colore finche' non lo apre. I valori arrivano con gli
// altri contatori (useCounters, una richiesta sola, aggiornata in tempo reale)
export function useNewsUnseen(userId: string, viewing: NewsKind | null, c: CountersApi) {
  const supabase = useMemo(() => createClient(), []);
  const { patch } = c;

  // Pannello aperto: segno = ora dell'ultima notizia di quel tipo (orologio del database)
  const markSeen = useCallback(
    async (kind: NewsKind) => {
      patch(kind === "on" ? { news_on: false } : { news_off: false });
      const { data: last } = await supabase
        .from("news")
        .select("created_at")
        .eq("kind", kind)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      await supabase
        .from("news_seen")
        .upsert({ user_id: userId, kind, seen_at: (last?.created_at as string | undefined) ?? new Date().toISOString() });
    },
    [supabase, userId, patch],
  );

  return {
    unseen: { on: c.data.news_on && viewing !== "on", off: c.data.news_off && viewing !== "off" },
    markSeen,
  };
}
