"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { RULES } from "@/lib/rules/config";
import { STATS as DRAGON_STATS } from "@/lib/dragons";
import { DICE_VARS, formulaVars } from "@/lib/rules/dice";
import { useStats } from "@/lib/rules/useStats";
import { createClient } from "@/lib/supabase/client";
import { rollDice } from "../dice-actions";

type DiceType = {
  id: string;
  name: string;
  description: string;
  formula: string;
  ask_target: boolean;
  staff_only: boolean;
};
type SkillOpt = { id: string; name: string; stat: string };
type ItemOpt = {
  id: string;
  item: { name: string; damage: string | null } | null;
};

export type DiceCategory = "abilita" | "statistiche" | "oggetti" | "liberi";

// Gruppo di un tiro in base a cosa usa la formula
export function diceCategory(formula: string, codes: string[]): DiceCategory {
  const v = formulaVars(formula, codes);
  if (v.has("ABILITA") || v.has("DABILITA")) return "abilita";
  if (v.has("ARMA")) return "oggetti";
  if (v.has("STAT") || v.has("DSTAT") || codes.some((c) => v.has(c)))
    return "statistiche";
  return "liberi";
}

// Riquadro dei dadi della chat: si sceglie il tiro (Gestione -> Dadi) e
// quello che chiede (statistica, abilita', oggetto, modificatore, DV).
// Il tiro lo fa il server e compare in chat per tutti
export default function DicePanel({
  roomId,
  characterId,
  canNarrate,
  category,
  onClose,
  onRolled,
}: {
  roomId: string;
  characterId: string;
  canNarrate: boolean;
  category?: DiceCategory; // solo i tiri di questo gruppo
  onClose?: () => void;
  onRolled?: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [types, setTypes] = useState<DiceType[] | null>(null);
  const [skills, setSkills] = useState<SkillOpt[]>([]);
  const [items, setItems] = useState<{ char: string; list: ItemOpt[] } | null>(
    null,
  );
  const [diceId, setDiceId] = useState("");
  const [stat, setStat] = useState("");
  const [skillId, setSkillId] = useState("");
  const [itemId, setItemId] = useState("");
  const [dragonStat, setDragonStat] = useState("");
  const [dragonSkill, setDragonSkill] = useState("");
  const [dragonSkills, setDragonSkills] = useState<
    { key: string; label: string }[]
  >([]);
  const [dragon, setDragon] = useState<{
    char: string;
    name: string | null;
  } | null>(null);
  const [mod, setMod] = useState("0");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const stats = useStats();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    Promise.all([
      supabase
        .from("dice_types")
        .select("id, name, description, formula, ask_target, staff_only")
        .eq("active", true)
        .order("sort_order")
        .order("name"),
      supabase
        .from("skills")
        .select("id, name, stat")
        .eq("active", true)
        .order("stat")
        .order("sort_order"),
    ]).then(([d, s]) => {
      const list = ((d.data ?? []) as DiceType[]).filter(
        (t) => canNarrate || !t.staff_only,
      );
      setTypes(list);
      setDiceId((cur) => cur || list[0]?.id || "");
      setSkills((s.data ?? []) as SkillOpt[]);
    });
  }, [supabase, canNarrate]);

  // drago cavalcato dal personaggio (per i tiri del drago)
  useEffect(() => {
    if (!characterId) return;
    Promise.all([
      supabase
        .from("dragons")
        .select("name")
        .eq("rider_id", characterId)
        .eq("status", "drago")
        .maybeSingle(),
      supabase.from("dragon_skills").select("key, label").order("sort_order"),
    ]).then(([d, s]) => {
      setDragon({
        char: characterId,
        name: d.data ? (d.data.name as string) || "Drago" : null,
      });
      setDragonSkills((s.data ?? []) as { key: string; label: string }[]);
    });
  }, [supabase, characterId]);

  useEffect(() => {
    if (!characterId) return;
    supabase
      .from("character_items")
      .select("id, item:items(name, damage)")
      .eq("character_id", characterId)
      .then(({ data }) =>
        setItems({
          char: characterId,
          list: ((data ?? []) as unknown as ItemOpt[]).filter(
            (i) => i.item?.damage,
          ),
        }),
      );
  }, [supabase, characterId]);

  const codes = stats.map((s) => s.code);
  const visible = (types ?? []).filter(
    (t) => !category || diceCategory(t.formula, codes) === category,
  );
  const dice = visible.find((t) => t.id === diceId) ?? visible[0];
  const vars = dice
    ? formulaVars(
        dice.formula,
        stats.map((s) => s.code),
      )
    : new Set<string>();
  const weapons = items?.char === characterId ? items.list : [];

  function roll() {
    if (!dice) return;
    setError(null);
    startTransition(async () => {
      const res = await rollDice(roomId, characterId, dice.id, {
        stat: stat || undefined,
        skillId: skillId || undefined,
        itemId: itemId || undefined,
        dragonStat: dragonStat || undefined,
        dragonSkill: dragonSkill || undefined,
        mod: Number(mod) || 0,
        target: dice.ask_target && target !== "" ? Number(target) : null,
      });
      if (res.error) setError(res.error);
      else onRolled?.();
    });
  }

  const field = "mb-1 block text-[0.7rem] tracking-wider text-muted uppercase";

  return (
    <div className="space-y-2 border border-accent/40 bg-black/40 p-3">
      {onClose && (
        <div className="flex items-center justify-between">
          <span className="font-serif text-accent">Dadi</span>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-muted hover:text-accent"
          >
            Chiudi
          </button>
        </div>
      )}
      {!types ? (
        <p className="text-sm text-muted">Caricamento...</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted">
          Nessun tiro di questo tipo: lo staff li crea in Gestione → Dadi.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className={field}>Tiro</span>
              <select
                value={dice?.id ?? ""}
                onChange={(e) => setDiceId(e.target.value)}
                className="input w-48! py-1 text-sm"
              >
                {visible.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            {vars.has("ABILITA") && (
              <label className="block">
                <span className={field}>Abilità</span>
                <select
                  value={skillId}
                  onChange={(e) => {
                    setSkillId(e.target.value);
                    // la statistica dell'abilita' (si puo' cambiare)
                    const s = skills.find((k) => k.id === e.target.value);
                    if (s) setStat(s.stat);
                  }}
                  className="input w-52! py-1 text-sm"
                >
                  <option value="">Scegli...</option>
                  {skills.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {vars.has("STAT") && (
              <label className="block">
                <span className={field}>Statistica</span>
                <select
                  value={stat}
                  onChange={(e) => setStat(e.target.value)}
                  className="input w-36! py-1 text-sm"
                >
                  <option value="">Scegli...</option>
                  {stats.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} · {s.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {vars.has("ARMA") && (
              <label className="block">
                <span className={field}>Oggetto</span>
                <select
                  value={itemId}
                  onChange={(e) => setItemId(e.target.value)}
                  className="input w-52! py-1 text-sm"
                >
                  <option value="">
                    {weapons.length ? "Scegli..." : "Nessun oggetto con danno"}
                  </option>
                  {weapons.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.item?.name} ({w.item?.damage})
                    </option>
                  ))}
                </select>
              </label>
            )}
            {(vars.has("DSTAT") || vars.has("DABILITA")) &&
              dragon?.char === characterId &&
              !dragon.name && (
                <p className="self-center text-sm text-red-400">
                  Il personaggio non cavalca un drago.
                </p>
              )}
            {vars.has("DSTAT") && (
              <label className="block">
                <span className={field}>Caratteristica del drago</span>
                <select
                  value={dragonStat}
                  onChange={(e) => setDragonStat(e.target.value)}
                  className="input w-44! py-1 text-sm"
                >
                  <option value="">Scegli...</option>
                  {DRAGON_STATS.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {vars.has("DABILITA") && (
              <label className="block">
                <span className={field}>Abilità del drago</span>
                <select
                  value={dragonSkill}
                  onChange={(e) => setDragonSkill(e.target.value)}
                  className="input w-48! py-1 text-sm"
                >
                  <option value="">Scegli...</option>
                  {dragonSkills.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {vars.has("MOD") && (
              <label className="block">
                <span className={field}>Modificatore</span>
                <input
                  type="number"
                  min={-20}
                  max={20}
                  value={mod}
                  onChange={(e) => setMod(e.target.value)}
                  className="input w-20! py-1 text-sm"
                />
              </label>
            )}
            {dice?.ask_target && (
              <label className="block">
                <span className={field}>Contro DV</span>
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className="input w-44! py-1 text-sm"
                >
                  <option value="">Nessuna</option>
                  {RULES.difficulties.map((d) => (
                    <option key={d.id} value={d.dv}>
                      {d.label} ({d.dv})
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              disabled={pending || !dice}
              onClick={roll}
              className="btn px-4 py-1.5 text-sm"
            >
              {pending ? "..." : "🎲 Tira"}
            </button>
          </div>
          {dice && (
            <p
              className="text-xs text-muted"
              title={[...vars]
                .map((v) => `${v}: ${DICE_VARS[v as keyof typeof DICE_VARS]}`)
                .join("\n")}
            >
              {dice.description || dice.formula}
            </p>
          )}
        </>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
