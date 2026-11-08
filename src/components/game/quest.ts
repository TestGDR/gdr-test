"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Quest Mode: master, moderatori e admin entrano in qualsiasi chat senza
// spostare il loro PG. Si accende e si spegne dal menu della disponibilita'.
export type Quest = { allowed: boolean; on: boolean; busy: boolean; toggle: () => void };
export const QuestContext = createContext<Quest | null>(null);

// Il permesso e lo stato cambiano di rado: una copia nel browser per 5 minuti
// evita due richieste a ogni caricamento della pagina
const QUEST_CACHE_MS = 5 * 60_000;
const questKey = (userId: string) => `quest:${userId}`;
function saveQuest(userId: string, allowed: boolean, on: boolean) {
  try {
    sessionStorage.setItem(questKey(userId), JSON.stringify({ at: Date.now(), allowed, on }));
  } catch {
    // senza memoria del browser si richiede ogni volta
  }
}

export function useQuestMode(userId: string): Quest {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(questKey(userId));
      const c = raw ? (JSON.parse(raw) as { at: number; allowed: boolean; on: boolean }) : null;
      if (c && Date.now() - c.at < QUEST_CACHE_MS) {
        Promise.resolve().then(() => {
          setAllowed(c.allowed);
          setOn(c.on);
        });
        return;
      }
    } catch {
      // si richiede
    }
    supabase.rpc("can_master_mode").then(({ data }) => {
      if (data !== true) return saveQuest(userId, false, false);
      supabase
        .from("profiles")
        .select("quest_mode")
        .eq("id", userId)
        .maybeSingle()
        .then(({ data: p, error }) => {
          // colonna non ancora creata (migrazione 0152): niente Quest Mode
          if (error) return;
          setAllowed(true);
          setOn(!!p?.quest_mode);
          saveQuest(userId, true, !!p?.quest_mode);
        });
    });
  }, [supabase, userId]);

  const toggle = useCallback(async () => {
    setBusy(true);
    const { error } = await supabase.rpc("set_quest_mode", { p_on: !on });
    setBusy(false);
    if (error) return;
    setOn(!on);
    saveQuest(userId, true, !on);
    router.refresh(); // la pagina ricontrolla subito dove si puo' entrare
  }, [supabase, on, router, userId]);

  return { allowed, on, busy, toggle };
}
