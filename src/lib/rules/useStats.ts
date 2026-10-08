"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_STATS, loadStats, type StatDef } from "./stats";

// Statistiche attive (lette una volta per pagina e condivise tra i componenti)
let cache: Promise<StatDef[]> | null = null;

export function useStats(): StatDef[] {
  const [stats, setStats] = useState<StatDef[]>(DEFAULT_STATS);
  useEffect(() => {
    cache ??= loadStats(createClient());
    cache.then(setStats);
  }, []);
  return stats;
}

// Dopo una modifica dal pannello: alla prossima lettura si ricaricano
export function resetStatsCache() {
  cache = null;
}
