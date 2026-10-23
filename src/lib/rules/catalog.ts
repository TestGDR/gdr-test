// Catalogo di abilita' e tratti (tabelle skills e traits, gestite dallo staff)
import type { SupabaseClient } from "@supabase/supabase-js";
import { RULES, type StatId } from "./config";

export type Skill = {
  id: string;
  name: string;
  stat: StatId;
  description: string;
  sort_order: number;
  active: boolean;
};

export type TraitModifier = {
  target: "skill" | "stat" | "initiative" | "hp" | "run" | "choice_skill" | "choice_stat" | "other";
  skill?: string; // nome dell'abilita' (target "skill")
  stat?: StatId; // target "stat"
  value: number;
  condition?: string; // vale solo in questa situazione
};

export type Trait = {
  id: string;
  name: string;
  kind: "vantaggio" | "svantaggio";
  cost: number;
  effect: string;
  choice: "nessuna" | "abilita" | "statistica";
  unique_group: string | null;
  requires_master: boolean;
  modifiers: TraitModifier[];
  sort_order: number;
  active: boolean;
  // migrazione 0157 (assenti se non eseguita)
  stat_costs?: Record<string, number> | null; // costo per statistica scelta
  choice_options?: string[] | null; // abilita' tra cui scegliere (nomi); vuoto = tutte
  incompatible_skills?: string[] | null; // non si prende con punti in queste abilita'
  narrative?: boolean; // migrazione 0158: niente bonus, il giocatore scrive una riga
};

type TraitRules = Pick<Trait, "cost"> & {
  stat_costs?: Record<string, number> | null;
  choice_options?: string[] | null;
  incompatible_skills?: string[] | null;
};

// Costo (o valore) del tratto: se dipende dalla statistica scelta, quello della statistica
export function traitCost(t: TraitRules, choice?: string | null) {
  const byStat = t.stat_costs && choice ? t.stat_costs[choice] : undefined;
  return typeof byStat === "number" ? byStat : t.cost;
}
// Testo del costo per gli elenchi: "1–4" se dipende dalla statistica
export function traitCostLabel(t: TraitRules) {
  const v = Object.values(t.stat_costs ?? {});
  return v.length ? `${Math.min(...v)}–${Math.max(...v)}` : String(t.cost);
}
// Abilita' che si possono scegliere per il tratto
export function traitSkillOptions<S extends { name: string }>(t: TraitRules, skills: S[]) {
  const only = (t.choice_options ?? []).map((n) => n.toLowerCase());
  return only.length ? skills.filter((k) => only.includes(k.name.toLowerCase())) : skills;
}
// Abilita' (con punti) che impediscono il tratto, oppure null
export function traitBlockedBy(t: TraitRules, skillLevels: { name: string; level: number }[]) {
  const bad = (t.incompatible_skills ?? []).map((n) => n.toLowerCase());
  return skillLevels.find((k) => k.level > 0 && bad.includes(k.name.toLowerCase()))?.name ?? null;
}

export type CharacterTrait = { trait_id: string; choice: string | null; note?: string | null };

type StatName = { id: string; code: string; label: string };
export const statLabel = (id: string, list: readonly StatName[] = RULES.stats) =>
  list.find((s) => s.id === id)?.label ?? id;
export const statCode = (id: string, list: readonly StatName[] = RULES.stats) =>
  list.find((s) => s.id === id)?.code ?? id.toUpperCase();

export async function loadCatalog(supabase: SupabaseClient) {
  const [{ data: skills }, { data: traits }] = await Promise.all([
    supabase.from("skills").select("*").order("sort_order").order("name"),
    supabase.from("traits").select("*").order("kind").order("sort_order").order("name"),
  ]);
  return { skills: (skills ?? []) as Skill[], traits: (traits ?? []) as Trait[] };
}

// Testo della scelta di un tratto (abilita' o statistica)
export function choiceLabel(trait: Pick<Trait, "choice">, choice: string | null | undefined, skills: Skill[]) {
  if (!choice) return null;
  if (trait.choice === "statistica") return statLabel(choice);
  return skills.find((s) => s.id === choice)?.name ?? choice;
}

// HP extra dei tratti (es. Salute fragile -5)
export function traitHpBonus(owned: CharacterTrait[], traits: Trait[]) {
  return owned.reduce((sum, o) => {
    const t = traits.find((x) => x.id === o.trait_id);
    return sum + (t?.modifiers ?? []).filter((m) => m.target === "hp").reduce((a, m) => a + m.value, 0);
  }, 0);
}
