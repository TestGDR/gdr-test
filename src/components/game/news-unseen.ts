"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { NewsKind } from "./NewsPanel";

// Notizie ON e OFF pubblicate dopo l'ultima volta che il giocatore ha aperto il
// pannello: l'icona cambia colore finche' non lo apre. Aggiornate in tempo reale.
export function useNewsUnseen(userId: string, viewing: NewsKind | null) {
  const supabase = useMemo(() => createClient(), []);
  const [unseen, setUnseen] = useState<Record<NewsKind, boolean>>({ on: false, off: false });

  const fetchUnseen = useCallback(async () => {
    const { data: seen } = await supabase.from("news_seen").select("kind, seen_at").eq("user_id", userId);
    const check = async (kind: NewsKind) => {
      const since = seen?.find((s) => s.kind === kind)?.seen_at as string | undefined;
      // le notizie scritte da me non contano (quelle senza autore si)
      let q = supabase
        .from("news")
        .select("id", { count: "exact", head: true })
        .eq("kind", kind)
        .or(`author_id.is.null,author_id.neq.${userId}`);
      if (since) q = q.gt("created_at", since);
      const { count } = await q;
      return (count ?? 0) > 0;
    };
    const [on, off] = await Promise.all([check("on"), check("off")]);
    return { on, off };
  }, [supabase, userId]);

  useEffect(() => {
    const ch = supabase
      .channel(`notizie-nuove:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "news" }, () => {
        fetchUnseen().then(setUnseen);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, userId, fetchUnseen]);

  // all'avvio e quando si chiude un pannello delle notizie si riconta
  useEffect(() => {
    if (!viewing) fetchUnseen().then(setUnseen);
  }, [viewing, fetchUnseen]);

  // Pannello aperto: segno = ora dell'ultima notizia di quel tipo (orologio del database)
  const markSeen = useCallback(
    async (kind: NewsKind) => {
      setUnseen((u) => ({ ...u, [kind]: false }));
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
    [supabase, userId],
  );

  return {
    unseen: { on: unseen.on && viewing !== "on", off: unseen.off && viewing !== "off" },
    markSeen,
  };
}
