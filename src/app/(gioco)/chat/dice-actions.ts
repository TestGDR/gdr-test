"use server";

import { webcrypto } from "node:crypto";
import type { TraitModifier } from "@/lib/rules/catalog";
import { RULES, type StatId } from "@/lib/rules/config";
import {
  formulaVars,
  rollFormula,
  type DiceRule,
  type DiceVar,
} from "@/lib/rules/dice";
import { capTraitModifiers } from "@/lib/rules/engine";
import { loadStats } from "@/lib/rules/stats";
import {
  STATS as DRAGON_STATS,
  dragonModifiers,
  type TraitEffect,
} from "@/lib/dragons";
import { getStaffContext } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";

export type DiceChoice = {
  stat?: string;
  skillId?: string;
  itemId?: string; // character_items.id (oggetto con un danno)
  dragonStat?: string; // caratteristica del drago (vigore, destrezza...)
  dragonSkill?: string; // abilita' del drago (volare...)
  mod?: number;
  target?: number | null;
};

// Numero casuale sicuro (il tiro lo fa il server)
const secureRng = () =>
  webcrypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;

// Tira un dado configurato in Gestione -> Dadi e lo pubblica in chat
export async function rollDice(
  roomId: string,
  characterId: string,
  diceId: string,
  choice: DiceChoice,
): Promise<{ error?: string }> {
  const { supabase, user, permissions } = await getStaffContext();

  const [{ data: dice }, { data: character }] = await Promise.all([
    supabase
      .from("dice_types")
      .select("*")
      .eq("id", diceId)
      .eq("active", true)
      .maybeSingle(),
    supabase
      .from("characters")
      .select("id, owner_id, status, attributes, honor")
      .eq("id", characterId)
      .maybeSingle(),
  ]);
  if (!dice) return { error: "Tiro non trovato." };
  if (dice.staff_only && !permissions.has("chat.narrazione"))
    return { error: "Questo tiro è riservato al master." };
  if (
    !character ||
    character.owner_id !== user.id ||
    character.status !== "attivo"
  )
    return { error: "Personaggio non valido." };

  const statList = await loadStats(supabase);
  const codes = statList.map((s) => s.code);
  const needed = formulaVars(dice.formula as string, codes);
  const attrs = (character.attributes ?? {}) as Record<string, number>;
  const vars: Partial<Record<DiceVar, number | string>> = {};
  const labels: Partial<Record<DiceVar, string>> = {};

  for (const s of statList) vars[s.code] = Number(attrs[s.id]) || RULES.statMin;
  vars.ONORE = (character.honor as number | null) ?? RULES.honor.start;

  // Abilita' scelta (e la sua statistica, se non se ne sceglie un'altra)
  type SkillRow = { id: string; name: string; stat: StatId };
  let skill = null as SkillRow | null;
  if (needed.has("ABILITA") || needed.has("TRATTI")) {
    if (choice.skillId) {
      const { data } = await supabase
        .from("skills")
        .select("id, name, stat")
        .eq("id", choice.skillId)
        .maybeSingle();
      skill = (data as SkillRow | null) ?? null;
    }
    if (needed.has("ABILITA") && !skill) return { error: "Scegli l'abilità." };
  }
  let stat: StatId | null = statList.some((s) => s.id === choice.stat)
    ? choice.stat!
    : (skill?.stat ?? null);
  if (needed.has("STAT")) {
    if (!stat) return { error: "Scegli la statistica." };
    vars.STAT = Number(attrs[stat]) || RULES.statMin;
    labels.STAT = statList.find((s) => s.id === stat)?.code;
  } else stat = null;
  if (skill) {
    const { data: lv } = await supabase
      .from("character_skills")
      .select("level")
      .eq("character_id", characterId)
      .eq("skill_id", skill.id)
      .maybeSingle();
    vars.ABILITA = (lv?.level as number | undefined) ?? 0;
    labels.ABILITA = skill.name;
  }

  // Tratti sempre attivi (senza condizioni) per l'abilita' e la statistica scelte
  if (needed.has("TRATTI")) {
    const { data: owned } = await supabase
      .from("character_traits")
      .select("choice, trait:traits(modifiers)")
      .eq("character_id", characterId);
    const mods: number[] = [];
    for (const o of (owned ?? []) as unknown as {
      choice: string | null;
      trait: { modifiers: TraitModifier[] } | null;
    }[])
      for (const m of o.trait?.modifiers ?? []) {
        if (m.condition) continue;
        if (skill && m.target === "skill" && m.skill === skill.name)
          mods.push(m.value);
        if (skill && m.target === "choice_skill" && o.choice === skill.id)
          mods.push(m.value);
        if (stat && m.target === "stat" && m.stat === stat) mods.push(m.value);
        if (stat && m.target === "choice_stat" && o.choice === stat)
          mods.push(m.value);
      }
    vars.TRATTI = capTraitModifiers(mods);
    labels.TRATTI = "tratti";
  }

  // Oggetto con un danno (variabile ARMA)
  if (needed.has("ARMA")) {
    if (!choice.itemId) return { error: "Scegli l'oggetto." };
    const { data: ci } = await supabase
      .from("character_items")
      .select("id, character_id, item:items(name, damage)")
      .eq("id", choice.itemId)
      .maybeSingle();
    const item = ci as unknown as {
      character_id: string;
      item: { name: string; damage: string | null } | null;
    } | null;
    if (!item || item.character_id !== characterId || !item.item?.damage)
      return { error: "Oggetto non valido." };
    vars.ARMA = item.item.damage;
    labels.ARMA = item.item.name;
  }

  // Drago cavalcato dal PG (variabili DSTAT, DABILITA, DTRATTI)
  if (needed.has("DSTAT") || needed.has("DABILITA") || needed.has("DTRATTI")) {
    const { data: dragon } = await supabase
      .from("dragons")
      .select("name, stats, skills, pregi, difetti")
      .eq("rider_id", characterId)
      .eq("status", "drago")
      .maybeSingle();
    if (!dragon) return { error: "Il personaggio non cavalca un drago." };
    const dStats = (dragon.stats ?? {}) as Record<string, number>;
    const dSkills = (dragon.skills ?? {}) as Record<string, number>;
    if (needed.has("DSTAT")) {
      const st = DRAGON_STATS.find((x) => x.key === choice.dragonStat);
      if (!st) return { error: "Scegli la caratteristica del drago." };
      vars.DSTAT = Number(dStats[st.key]) || 0;
      labels.DSTAT = `${dragon.name || "Drago"} ${st.label}`;
    }
    if (needed.has("DABILITA")) {
      const { data: sk } = await supabase
        .from("dragon_skills")
        .select("key, label")
        .eq("key", choice.dragonSkill ?? "")
        .maybeSingle();
      if (!sk) return { error: "Scegli l'abilità del drago." };
      vars.DABILITA = Number(dSkills[sk.key as string]) || 0;
      labels.DABILITA = sk.label as string;
    }
    if (needed.has("DTRATTI")) {
      const { data: effects } = await supabase
        .from("dragon_trait_effects")
        .select("*");
      const mods = dragonModifiers(
        {
          pregi: (dragon.pregi ?? []) as string[],
          difetti: (dragon.difetti ?? []) as string[],
        },
        (effects ?? []) as TraitEffect[],
      );
      vars.DTRATTI =
        (choice.dragonStat
          ? (mods[`caratteristica:${choice.dragonStat}`]?.total ?? 0)
          : 0) +
        (choice.dragonSkill
          ? (mods[`abilita:${choice.dragonSkill}`]?.total ?? 0)
          : 0);
      labels.DTRATTI = "pregi/difetti";
    }
  }

  if (needed.has("MOD")) {
    vars.MOD = Math.max(-20, Math.min(20, Math.trunc(Number(choice.mod)) || 0));
    labels.MOD = "mod.";
  }
  const target =
    dice.ask_target &&
    typeof choice.target === "number" &&
    Number.isFinite(choice.target)
      ? Math.max(0, Math.min(100, Math.trunc(choice.target)))
      : null;

  const result = rollFormula(
    dice.formula as string,
    (dice.rules ?? []) as DiceRule[],
    { vars, varLabels: labels, target },
    secureRng,
    codes,
  );
  if ("error" in result) return { error: result.error };

  const admin = createAdminClient();
  if (!admin) return { error: "Configurazione del server incompleta." };
  const { error } = await admin.rpc("post_dice_roll", {
    p_user: user.id,
    p_room: roomId,
    p_character: characterId,
    p_content: `${dice.name}: ${result.text}`,
    p_data: { dice: dice.name, formula: dice.formula, ...result },
  });
  if (error)
    return {
      error: error.message.length < 140 ? error.message : "Tiro non riuscito.",
    };
  return {};
}

// ---------------------------------------------------------------------
// Dadi liberi: il giocatore scrive la formula (es. 3d6+1)
// ---------------------------------------------------------------------
export async function rollFreeDice(
  roomId: string,
  characterId: string,
  formula: string,
): Promise<{ error?: string }> {
  const { supabase, user } = await getStaffContext();
  const { data: character } = await supabase
    .from("characters")
    .select("id, owner_id, status")
    .eq("id", characterId)
    .maybeSingle();
  if (
    !character ||
    character.owner_id !== user.id ||
    character.status !== "attivo"
  )
    return { error: "Personaggio non valido." };
  const f = formula.trim().slice(0, 40);
  const result = rollFormula(f, [], { vars: {} }, secureRng, []);
  if ("error" in result) return { error: result.error };
  return postRoll(user.id, roomId, characterId, `dadi liberi: ${result.text}`, {
    dice: "libero",
    formula: f,
    ...result,
  });
}

// ---------------------------------------------------------------------
// Raggira: prova contrapposta (regolamento, "Ingannare"):
// EMP + Dissimulare + d10 contro EMP + Percepire Intenzioni + d10 del bersaglio.
// A parita' vince chi difende
// ---------------------------------------------------------------------
const PROVA_RULES: DiceRule[] = [
  {
    when: "naturale",
    op: "=",
    value: 10,
    action: "aggiungi",
    formula: "1d10",
    repeat: true,
    label: "esplode +1d10",
  },
  {
    when: "naturale",
    op: "=",
    value: 1,
    action: "sottrai",
    formula: "1d10",
    label: "fallimento −1d10",
  },
];

export async function rollRaggira(
  roomId: string,
  characterId: string,
  targetId: string,
): Promise<{ error?: string }> {
  const { supabase, user } = await getStaffContext();
  if (characterId === targetId)
    return { error: "Scegli un altro personaggio." };
  const [{ data: me }, { data: target }, { data: skills }] = await Promise.all([
    supabase
      .from("characters")
      .select("id, name, owner_id, status, attributes")
      .eq("id", characterId)
      .maybeSingle(),
    supabase
      .from("characters")
      .select("id, name, status, attributes")
      .eq("id", targetId)
      .maybeSingle(),
    supabase
      .from("skills")
      .select("id, name")
      .in("name", ["Dissimulare", "Percepire Intenzioni"]),
  ]);
  if (!me || me.owner_id !== user.id || me.status !== "attivo")
    return { error: "Personaggio non valido." };
  if (!target || target.status !== "attivo")
    return { error: "Il bersaglio non è un personaggio attivo." };

  const skillId = (name: string) =>
    (skills ?? []).find((s) => s.name === name)?.id as string | undefined;
  const levelOf = async (charId: string, name: string) => {
    const id = skillId(name);
    if (!id) return 0;
    const { data } = await supabase
      .from("character_skills")
      .select("level")
      .eq("character_id", charId)
      .eq("skill_id", id)
      .maybeSingle();
    return (data?.level as number | undefined) ?? 0;
  };
  const emp = (c: { attributes: unknown }) =>
    Number((c.attributes as Record<string, number> | null)?.emp) ||
    RULES.statMin;

  const def = rollFormula(
    "EMP + ABILITA + 1d10",
    PROVA_RULES,
    {
      vars: {
        EMP: emp(target),
        ABILITA: await levelOf(targetId, "Percepire Intenzioni"),
      },
      varLabels: { ABILITA: "Percepire Intenzioni" },
    },
    secureRng,
    ["EMP"],
  );
  if ("error" in def) return { error: def.error };
  const att = rollFormula(
    "EMP + ABILITA + 1d10",
    PROVA_RULES,
    {
      vars: {
        EMP: emp(me),
        ABILITA: await levelOf(characterId, "Dissimulare"),
      },
      varLabels: { ABILITA: "Dissimulare" },
      target: def.total,
    },
    secureRng,
    ["EMP"],
  );
  if ("error" in att) return { error: att.error };
  const won = att.total > def.total; // a parita' vince chi difende
  const margin = att.total - def.total;
  const content =
    `Raggira ${target.name}: ${att.text.replace(/ contro DV.*$/, "")} contro ` +
    `${def.text} — ${won ? "riuscito" : "fallito"} (margine ${margin >= 0 ? "+" : ""}${margin})`;
  return postRoll(user.id, roomId, characterId, content, {
    dice: "raggira",
    target: target.name,
    attack: att,
    defense: def,
    success: won,
    margin,
  });
}

async function postRoll(
  userId: string,
  roomId: string,
  characterId: string,
  content: string,
  data: unknown,
) {
  const admin = createAdminClient();
  if (!admin) return { error: "Configurazione del server incompleta." };
  const { error } = await admin.rpc("post_dice_roll", {
    p_user: userId,
    p_room: roomId,
    p_character: characterId,
    p_content: content,
    p_data: data,
  });
  if (error)
    return {
      error: error.message.length < 140 ? error.message : "Tiro non riuscito.",
    };
  return {};
}
