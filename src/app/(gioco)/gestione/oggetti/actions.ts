"use server";

import { COMBAT_CATALOG } from "@/lib/rules/combat-catalog";
import { getStaffContext } from "@/lib/staff";

// Importa armi, scudi, armature e oggetti del regolamento (solo quelli che
// mancano, per nome). I costi in Risorse diventano monete col cambio impostato.
export async function importCombatCatalog(): Promise<{
  error?: string;
  added?: number;
  skipped?: number;
}> {
  const { supabase, permissions } = await getStaffContext();
  if (!permissions.has("oggetti.gestire"))
    return { error: "Non hai il permesso di gestire gli oggetti." };

  const [
    { data: existing },
    { data: slots },
    { data: cats },
    { data: skills },
    { data: settings },
  ] = await Promise.all([
    supabase.from("items").select("name"),
    supabase.from("equipment_slots").select("id, name, slot_group"),
    supabase.from("item_categories").select("id, name"),
    supabase.from("skills").select("id, name"),
    supabase.from("item_settings").select("coins_per_r").maybeSingle(),
  ]);
  const have = new Set(
    (existing ?? []).map((i) => (i.name as string).toLowerCase()),
  );
  const rate = (settings?.coins_per_r as number | undefined) ?? 100;
  const catId = (n: string) => cats?.find((c) => c.name === n)?.id ?? null;
  const skillId = (n?: string) =>
    n
      ? (skills?.find(
          (s) => (s.name as string).toLowerCase() === n.toLowerCase(),
        )?.id ?? null)
      : null;
  // dove si indossa: armi e scudi in mano, armature nella parte del corpo
  const hand = slots?.find((s) => s.slot_group)?.slot_group ?? null;
  const partSlot: Record<string, string[]> = {
    testa: ["testa"],
    tronco: ["busto", "tronco", "torso"],
    braccia: ["braccio", "braccia"],
    gambe: ["gambe", "gamba"],
  };
  const slotFor = (part: string) =>
    slots?.find((s) =>
      partSlot[part]?.includes((s.name as string).toLowerCase()),
    )?.id ?? null;

  const rows = COMBAT_CATALOG.filter(
    (c) => !have.has(c.name.toLowerCase()),
  ).map((c) => ({
    name: c.name,
    description: c.description,
    kind: c.kind,
    category_id: catId(c.category),
    price: Math.round(c.costR * rate),
    in_shop: true,
    at_signup:
      c.costR === 0 &&
      (c.kind === "arma" || c.kind === "scudo" || c.kind === "armatura"),
    slot_id: c.armor_part ? slotFor(c.armor_part) : null,
    slot_group: c.kind === "arma" || c.kind === "scudo" ? hand : null,
    weight_kg: c.weight_kg,
    weapon_category: c.weapon_category ?? null,
    weapon_skill_id: skillId(c.skill),
    damage: c.damage ?? null,
    damage_type: c.damage_type ?? null,
    hands: c.hands ?? null,
    aff_max: c.aff_max ?? null,
    body_min: c.body_min ?? 0,
    reach_m: c.reach_m ?? null,
    range_m: c.range_m ?? null,
    reload_actions: c.reload_actions ?? 0,
    pierce: c.pierce ?? 0,
    effects: c.effects ?? [],
    ammo_type: c.ammo_type ?? null,
    parry_bonus: c.parry_bonus ?? 0,
    bash_dice: c.bash_dice ?? null,
    attack_penalty: c.attack_penalty ?? 0,
    armor_part: c.armor_part ?? null,
    material: c.material ?? null,
    sp_max: c.sp_max ?? null,
    encumbrance: c.encumbrance ?? 0,
    ammo_capacity: c.ammo_capacity ?? null,
  }));
  if (rows.length) {
    const { error } = await supabase.from("items").insert(rows);
    if (error)
      return {
        error:
          error.code === "42703"
            ? "Prima va eseguita la migrazione 0107 in Supabase."
            : error.message,
      };
  }
  const missingSkills = [
    ...new Set(
      COMBAT_CATALOG.map((c) => c.skill).filter(
        (s): s is string => !!s && !skillId(s),
      ),
    ),
  ];
  return {
    added: rows.length,
    skipped: COMBAT_CATALOG.length - rows.length,
    ...(missingSkills.length
      ? {
          error: `Abilità che mancano nel catalogo (assegnale poi alle armi): ${missingSkills.join(", ")}.`,
        }
      : {}),
  };
}
