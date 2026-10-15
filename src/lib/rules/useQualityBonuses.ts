"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { QualityBonusRow } from "./quality";

// Bonus della qualita' per tipo di oggetto (Gestione -> Oggetti -> Qualita'):
// si caricano una volta e si condividono tra scheda, mercato e gestione.
let cache: Promise<QualityBonusRow[]> | null = null;

export function loadQualityBonuses(fresh = false) {
  if (!cache || fresh)
    cache = Promise.resolve(
      createClient().from("quality_bonuses").select("*"),
    ).then(({ data }) => (data ?? []) as QualityBonusRow[]);
  return cache;
}

export function useQualityBonuses() {
  const [rows, setRows] = useState<QualityBonusRow[]>([]);
  useEffect(() => {
    let alive = true;
    loadQualityBonuses().then((r) => alive && setRows(r));
    return () => {
      alive = false;
    };
  }, []);
  return rows;
}
