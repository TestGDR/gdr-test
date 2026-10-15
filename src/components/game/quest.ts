"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Quest Mode: master, moderatori e admin entrano in qualsiasi chat senza
// spostare il loro PG. Si accende e si spegne dal menu della disponibilita'.
export type Quest = { allowed: boolean; on: boolean; busy: boolean; toggle: () => void };
export const QuestContext = createContext<Quest | null>(null);

export function useQuestMode(userId: string): Quest {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.rpc("can_master_mode").then(({ data }) => {
      if (data !== true) return;
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
        });
    });
  }, [supabase, userId]);

  const toggle = useCallback(async () => {
    setBusy(true);
    const { error } = await supabase.rpc("set_quest_mode", { p_on: !on });
    setBusy(false);
    if (error) return;
    setOn(!on);
    router.refresh(); // la pagina ricontrolla subito dove si puo' entrare
  }, [supabase, on, router]);

  return { allowed, on, busy, toggle };
}
