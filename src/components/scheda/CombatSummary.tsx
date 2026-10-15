"use client";

import {
  isWoundHealed,
  woundDaysLeft,
  woundPenaltyNow,
} from "@/lib/rules/condition";
import { useGameSettings } from "@/lib/rules/useGameSettings";
import { useCallback, useEffect, useMemo, useState } from "react";
import { durability } from "@/lib/rules/combat";
import { COMBAT, type ArmorPart } from "@/lib/rules/combat-config";
import { durabilityBonus, qualityBonus } from "@/lib/rules/quality";
import { useQualityBonuses } from "@/lib/rules/useQualityBonuses";
import { createClient } from "@/lib/supabase/client";

type Owned = {
  id: string;
  equipped: boolean;
  aff_current: number | null;
  sp_current: number | null;
  charges: number | null;
  quality_id: string | null;
  quality: { name: string } | null;
  item: {
    name: string;
    kind: string;
    damage_type: string | null;
    material: string | null;
    damage: string | null;
    bash_dice: string | null;
    weapon_category: string | null;
    armor_part: string | null;
    aff_max: number | null;
    sp_max: number | null;
    encumbrance: number;
    parry_bonus: number;
    ammo_type: string | null;
    ammo_capacity: number | null;
  } | null;
};
type Wound = {
  id: string;
  location: string;
  severity: string;
  bleed: number;
  penalty: number;
  mutilated: boolean;
  created_at: string;
};

const SEVERITY: Record<string, string> = {
  light: "Ferita lieve",
  medium: "Ferita media",
  grave: "Ferita grave",
  mortal: "Ferita mortale",
  bleeding: "Taglio che sanguina",
};

// Pagina Caratteristiche: armi, armatura per parte del corpo, ingombro e ferite
export default function CombatSummary({
  characterId,
  refStat,
}: {
  characterId: string;
  refStat: number;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Owned[] | null>(null);
  useGameSettings(); // giorni di guarigione dal pannello di gestione
  const [wounds, setWounds] = useState<Wound[]>([]);
  const [now, setNow] = useState(0);
  const [canHeal, setCanHeal] = useState(false);
  const bonusRows = useQualityBonuses();
  // bonus della qualita' per il tipo dell'oggetto (Gestione -> Oggetti)
  const bonus = (i: Owned) => qualityBonus(i.item!, i.quality_id, bonusRows);
  const wear = (i: Owned) => durability(i.item!, durabilityBonus(bonus(i)), i);

  const load = useCallback(
    () =>
      Promise.all([
        supabase
          .from("character_items")
          .select(
            "id, equipped, aff_current, sp_current, charges, quality_id, quality:item_qualities(name), item:items(name, kind, damage_type, material, damage, bash_dice, weapon_category, armor_part, aff_max, sp_max, encumbrance, parry_bonus, ammo_type, ammo_capacity)",
          )
          .eq("character_id", characterId),
        supabase
          .from("character_wounds")
          .select(
            "id, location, severity, bleed, penalty, mutilated, created_at",
          )
          .eq("character_id", characterId)
          .order("created_at"),
      ]).then(([a, b]) => {
        setItems((a.data ?? []) as unknown as Owned[]);
        // le ferite ormai guarite non si mostrano piu'
        const t = Date.now();
        setWounds(
          ((b.data ?? []) as Wound[]).filter((w) => !isWoundHealed(w, t)),
        );
        setNow(t);
      }),
    [supabase, characterId],
  );
  useEffect(() => {
    Promise.resolve().then(load);
    supabase.rpc("can_manage_rules").then(({ data }) => setCanHeal(!!data));
  }, [load, supabase]);

  if (!items) return null;
  const worn = items.filter((i) => i.equipped && i.item);
  const weapons = worn.filter(
    (i) => i.item!.kind === "arma" || i.item!.kind === "scudo",
  );
  const armor = new Map<string, Owned>();
  for (const i of worn)
    if (i.item!.kind === "armatura" && i.item!.armor_part)
      armor.set(i.item!.armor_part, i);
  const encumbrance = worn.reduce(
    (a, i) =>
      a +
      (i.item!.kind === "armatura"
        ? Math.min(0, i.item!.encumbrance + bonus(i).encumbrance)
        : 0),
    0,
  );
  const ammo = items.filter((i) => i.item?.kind === "munizione");
  const loc = (id: string) =>
    COMBAT.locations.find((l) => l.id === id)?.label ?? id;

  async function heal(id: string) {
    await supabase.from("character_wounds").delete().eq("id", id);
    load();
  }

  const head = "mb-1 text-[0.7rem] tracking-[0.14em] text-muted uppercase";
  return (
    <div className="w-full space-y-3 border-t border-border/60 pt-3 text-sm sm:col-span-2">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className={head}>In mano</p>
          {weapons.length === 0 ? (
            <p className="text-muted">Mani nude</p>
          ) : (
            <ul className="space-y-0.5">
              {weapons.map((w) => {
                const d = wear(w);
                return (
                  <li key={w.id}>
                    <span className="text-accent">{w.item!.name}</span>{" "}
                    <span className="text-muted">
                      {w.item!.kind === "scudo"
                        ? `Parare +${w.item!.parry_bonus + bonus(w).parry}`
                        : w.item!.damage}
                      {w.quality && ` · ${w.quality.name}`}
                      {d && (
                        <span
                          className={
                            d.current <= 0
                              ? " text-red-400"
                              : d.current < d.max
                                ? " text-[#f0c75e]"
                                : ""
                          }
                        >
                          {" "}
                          · AFF {d.current}/{d.max}
                          {d.current <= 0 && " (rotta)"}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {ammo.length > 0 && (
            <p className="mt-1 text-muted">
              {ammo
                .map(
                  (a) =>
                    `${a.item!.name}: ${a.charges ?? a.item!.ammo_capacity ?? 0}`,
                )
                .join(" · ")}
            </p>
          )}
        </div>
        <div>
          <p className={head}>Armatura (SP)</p>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            {COMBAT.armorParts.map((p) => {
              const a = armor.get(p.id as ArmorPart);
              const d = a ? wear(a) : null;
              return (
                <li key={p.id} className="flex justify-between gap-2">
                  <span className="text-muted">{p.label.split(" ")[0]}</span>
                  <span
                    className={
                      d && d.current < d.max
                        ? "text-[#f0c75e]"
                        : "text-foreground"
                    }
                    title={a?.item?.name}
                  >
                    {d ? `${d.current}/${d.max}` : "0"}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-1 text-muted">
            Ingombro {encumbrance} · RIF in combattimento{" "}
            <span className="text-foreground">{refStat + encumbrance}</span>
          </p>
        </div>
      </div>
      {wounds.length > 0 && (
        <div>
          <p className={head}>Ferite</p>
          <ul className="space-y-0.5">
            {wounds.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-2">
                <span className="text-red-300">
                  {SEVERITY[w.severity] ?? w.severity}
                </span>
                <span className="text-muted">
                  {loc(w.location)}
                  {woundPenaltyNow(w, now)
                    ? ` · ${woundPenaltyNow(w, now)} alle prove`
                    : ""}
                  {woundDaysLeft(w, now) !== null
                    ? ` · guarisce in ${woundDaysLeft(w, now)} ${woundDaysLeft(w, now) === 1 ? "giorno" : "giorni"}`
                    : ""}
                  {w.bleed ? ` · sanguina ${w.bleed} PF a round` : ""}
                  {w.mutilated ? " · mutilato" : ""}
                </span>
                {canHeal && (
                  <button
                    type="button"
                    onClick={() => heal(w.id)}
                    className="text-xs text-muted hover:text-accent"
                  >
                    guarita
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
