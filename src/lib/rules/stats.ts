// Statistiche del personaggio: si gestiscono da Gestione -> Abilita' e tratti
// -> Statistiche (tabella "stats"). Le 6 del regolamento sono quelle di base
// (servono alle statistiche derivate) e fanno da riserva se la tabella manca.
import type { SupabaseClient } from "@supabase/supabase-js";
import { RULES } from "./config.ts";

export type StatDef = {
  id: string; // codice interno (chiave in characters.attributes)
  code: string; // sigla (es. REF), usata anche nelle formule dei dadi
  label: string;
  description: string;
  sort_order: number;
  core: boolean;
  active: boolean;
};

export const DEFAULT_STATS: StatDef[] = RULES.stats.map((s, i) => ({
  id: s.id,
  code: s.code,
  label: s.label,
  description: s.description,
  sort_order: i + 1,
  core: true,
  active: true,
}));

// Tutte (anche quelle disattivate) oppure solo le attive
export async function loadStats(
  supabase: SupabaseClient,
  all = false,
): Promise<StatDef[]> {
  const { data, error } = await supabase
    .from("stats")
    .select("*")
    .order("sort_order")
    .order("label");
  if (error || !data?.length) return DEFAULT_STATS;
  const list = data as StatDef[];
  return all ? list : list.filter((s) => s.active);
}

export const statOf = (list: StatDef[], id: string | null | undefined) =>
  list.find((s) => s.id === id);
