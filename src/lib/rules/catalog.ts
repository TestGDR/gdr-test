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
};

export type CharacterTrait = { trait_id: string; choice: string | null };

export const statLabel = (id: string) => RULES.stats.find((s) => s.id === id)?.label ?? id;
export const statCode = (id: string) => RULES.stats.find((s) => s.id === id)?.code ?? id.toUpperCase();

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
