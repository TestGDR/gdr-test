"use server";

// =====================================================================
// Combattimento in chat (documento "Combattimento, armi e danni").
// Chi attacca lancia l'attacco (resta in attesa), il bersaglio lancia la
// difesa (Parare, Schivare, Incassare): il server confronta i tiri, calcola
// il danno e salva PF, SP, AFF, ferite. I tiri li fa solo il server.
// =====================================================================

import { webcrypto } from "node:crypto";
import { freshSince } from "@/lib/chat-ttl";
import type { TraitModifier } from "@/lib/rules/catalog";
import {
  attackKindModifier,
  diceCount,
  durability,
  dyingDv,
  location as locationOf,
  locationFromD10,
  rangeBand,
  resolveDamage,
  rollDamageDice,
  takeMargin,
  weaponValues,
} from "@/lib/rules/combat";
import {
  COMBAT,
  type ArmorPart,
  type AttackKind,
  type DefenseKind,
  type LocationId,
} from "@/lib/rules/combat-config";
import { RULES } from "@/lib/rules/config";
import {
  capTraitModifiers,
  deriveStats,
  rollD10,
  type Stats,
} from "@/lib/rules/engine";
import { currentStamina, hpState, recoveredHp } from "@/lib/rules/hp";
import { getStaffContext } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";

const rng = () => webcrypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
type Admin = NonNullable<ReturnType<typeof createAdminClient>>;
type Result = { error?: string };

// ---------------------------------------------------------------------
// Dati del combattente
// ---------------------------------------------------------------------
type ItemRow = {
  id: string;
  name: string;
  kind: string;
  damage: string | null;
  weapon_category: string | null;
  weapon_skill_id: string | null;
  hands: string | null;
  body_min: number;
  range_m: number | null;
  reload_actions: number;
  pierce: number;
  effects: string[];
  ammo_type: string | null;
  aff_max: number | null;
  parry_bonus: number;
  bash_dice: string | null;
  attack_penalty: number;
  armor_part: string | null;
  sp_max: number | null;
  encumbrance: number;
  ammo_capacity: number | null;
};
type Quality = {
  hit_bonus: number;
  damage_bonus: number;
  pierce_bonus: number;
  aff_bonus: number;
  sp_bonus: number;
};
type Gear = {
  id: string;
  equipped: boolean;
  aff_current: number | null;
  sp_current: number | null;
  charges: number | null;
  loaded: boolean;
  reload_progress: number;
  item: ItemRow;
  quality: Quality | null;
};
type CharRow = {
  id: string;
  name: string;
  owner_id: string;
  status: string;
  attributes: Record<string, number> | null;
  hp_current: number | null;
  hp_updated_at: string | null;
  stamina_current: number | null;
  stamina_updated_at: string | null;
  dead_at: string | null;
  dying_since: string | null;
  dying_round: number;
  dying_save_due: boolean;
  stabilized_at: string | null;
  stunned: boolean;
};
type Wound = {
  id: string;
  location: string;
  severity: string;
  bleed: number;
  penalty: number;
};

const CHAR_COLS =
  "id, name, owner_id, status, attributes, hp_current, hp_updated_at, stamina_current, stamina_updated_at, dead_at, dying_since, dying_round, dying_save_due, stabilized_at, stunned";

async function loadFighter(admin: Admin, id: string, now: number) {
  const [
    { data: c },
    { data: lv },
    { data: tr },
    { data: gear },
    { data: wounds },
    { data: skills },
  ] = await Promise.all([
    admin.from("characters").select(CHAR_COLS).eq("id", id).maybeSingle(),
    admin
      .from("character_skills")
      .select("skill_id, level")
      .eq("character_id", id),
    admin
      .from("character_traits")
      .select("choice, trait:traits(name, modifiers)")
      .eq("character_id", id),
    admin
      .from("character_items")
      .select(
        "id, equipped, aff_current, sp_current, charges, loaded, reload_progress, item:items(*), quality:item_qualities(hit_bonus, damage_bonus, pierce_bonus, aff_bonus, sp_bonus)",
      )
      .eq("character_id", id),
    admin
      .from("character_wounds")
      .select("id, location, severity, bleed, penalty")
      .eq("character_id", id),
    admin.from("skills").select("id, name, stat"),
  ]);
  if (!c) return null;
  const ch = c as CharRow;
  const stat = (s: string) => Number(ch.attributes?.[s]) || RULES.statMin;
  const stats = Object.fromEntries(
    RULES.stats.map((s) => [s.id, stat(s.id)]),
  ) as Stats;
  const owned = (tr ?? []) as unknown as {
    choice: string | null;
    trait: { name: string; modifiers: TraitModifier[] } | null;
  }[];
  const hpBonus = owned.reduce(
    (a, o) =>
      a +
      (o.trait?.modifiers ?? [])
        .filter((m) => m.target === "hp")
        .reduce((x, m) => x + m.value, 0),
    0,
  );
  const d = deriveStats(stats, hpBonus);
  const rec = recoveredHp(ch, d.hp, d.rec, now);
  const items = ((gear ?? []) as unknown as Gear[]).filter((g) => g.item);
  const equipped = items.filter((g) => g.equipped);
  const armor: Partial<Record<ArmorPart, Gear>> = {};
  for (const g of equipped)
    if (g.item.kind === "armatura" && g.item.armor_part)
      armor[g.item.armor_part as ArmorPart] = g;
  const levels = new Map(
    (lv ?? []).map((l) => [l.skill_id as string, l.level as number]),
  );
  const skillList = (skills ?? []) as {
    id: string;
    name: string;
    stat: string;
  }[];
  const skillByName = (n: string) =>
    skillList.find((s) => s.name.toLowerCase() === n.toLowerCase());
  const w = (wounds ?? []) as Wound[];
  const worst = (locs: string[]) =>
    Math.min(
      0,
      ...w.filter((x) => locs.includes(x.location)).map((x) => x.penalty),
    );

  return {
    c: ch,
    stats,
    maxHp: d.hp,
    rec: d.rec,
    maxStamina: d.stamina,
    hp: rec.hp,
    hpSince: rec.since,
    stamina: currentStamina(ch, d.stamina, now),
    unarmed: d.unarmed.replace("−", "-"),
    items,
    equipped,
    armor,
    encumbrance: equipped.reduce(
      (a, g) => a + (g.item.kind === "armatura" ? g.item.encumbrance : 0),
      0,
    ),
    wounds: w,
    armPenalty: worst(["arm_r", "arm_l"]),
    legPenalty: worst(["leg_r", "leg_l"]),
    skillList,
    skillByName,
    level: (skillId?: string | null) =>
      skillId ? (levels.get(skillId) ?? 0) : 0,
    // tratti sempre attivi per l'abilita' e la statistica (tetto +-3)
    traits: (
      skillId: string | null | undefined,
      statId: string,
      extra?: "initiative",
    ) => {
      const sk = skillList.find((s) => s.id === skillId);
      const mods: number[] = [];
      for (const o of owned)
        for (const m of o.trait?.modifiers ?? []) {
          if (m.condition) continue;
          if (sk && m.target === "skill" && m.skill === sk.name)
            mods.push(m.value);
          if (sk && m.target === "choice_skill" && o.choice === sk.id)
            mods.push(m.value);
          if (m.target === "stat" && m.stat === statId) mods.push(m.value);
          if (m.target === "choice_stat" && o.choice === statId)
            mods.push(m.value);
          if (extra && m.target === extra) mods.push(m.value);
        }
      // Riflessi pronti: +2 all'iniziativa anche se il tratto non ha il modificatore
      if (
        extra === "initiative" &&
        !mods.length &&
        owned.some((o) => o.trait?.name === COMBAT.quickReflexesTrait)
      )
        mods.push(COMBAT.quickReflexesBonus);
      return capTraitModifiers(mods);
    },
  };
}
type Fighter = NonNullable<Awaited<ReturnType<typeof loadFighter>>>;

// Tiro di combattimento: STAT + abilita' + modificatori + d10 che esplode
type Mod = { label: string; value: number };
function combatRoll(
  f: Fighter,
  statId: string,
  skill: { id: string; name: string } | undefined,
  mods: Mod[],
  cap?: number,
) {
  const statVal = f.stats[statId] ?? RULES.statMin;
  let lvl = f.level(skill?.id);
  if (cap !== undefined) lvl = Math.min(lvl, cap);
  const all = [...mods];
  const traits = f.traits(skill?.id, statId);
  if (traits) all.push({ label: "tratti", value: traits });
  if (f.stamina <= 0)
    all.push({ label: "Stamina a 0", value: COMBAT.staminaZeroPenalty });
  const roll = rollD10(rng);
  const total =
    statVal + lvl + all.reduce((a, m) => a + m.value, 0) + roll.total;
  const sign = (n: number) => (n >= 0 ? `+ ${n}` : `− ${-n}`);
  const dice =
    roll.rolls.length > 1
      ? `d10 [${roll.rolls.join(roll.event === "fallimento" ? " − " : " + ")}]`
      : `d10 ${roll.total}`;
  const code =
    statId === "ref" ? "RIF" : statId === "will" ? "TEM" : statId.toUpperCase();
  const text =
    `${code} ${statVal} + ${skill?.name ?? "nessuna abilità"} ${lvl}` +
    all
      .filter((m) => m.value)
      .map((m) => ` ${sign(m.value)} ${m.label}`)
      .join("") +
    ` + ${dice} = ${total}`;
  return { total, natural: roll.rolls[0], text };
}

// ---------------------------------------------------------------------
// Salvataggi
// ---------------------------------------------------------------------
async function saveHp(
  admin: Admin,
  f: Fighter,
  newHp: number,
  now: number,
  extra: Record<string, unknown> = {},
) {
  const hp = Math.max(0, Math.min(f.maxHp, newHp));
  const iso = new Date(now).toISOString();
  const patch: Record<string, unknown> = {
    hp_current: hp,
    hp_updated_at:
      hp >= f.maxHp ? iso : new Date(f.hpSince ?? now).toISOString(),
    ...extra,
  };
  if (hp <= 0 && !f.c.dying_since && !extra.dead_at)
    Object.assign(patch, {
      dying_since: iso,
      dying_round: 0,
      dying_save_due: true,
      stabilized_at: null,
      hp_updated_at: iso,
    });
  if (hp > 0)
    Object.assign(patch, {
      dying_since: null,
      dying_round: 0,
      dying_save_due: false,
      stabilized_at: null,
    });
  await admin.from("characters").update(patch).eq("id", f.c.id);
  f.hp = hp;
  return hp;
}

async function spendStamina(
  admin: Admin,
  f: Fighter,
  cost: number,
  now: number,
) {
  const left = Math.max(0, f.stamina - cost);
  await admin
    .from("characters")
    .update({
      stamina_current: left,
      stamina_updated_at: new Date(now).toISOString(),
    })
    .eq("id", f.c.id);
  return left;
}

async function post(
  admin: Admin,
  userId: string,
  roomId: string,
  characterId: string,
  content: string,
  data: Record<string, unknown>,
): Promise<Result> {
  const { error } = await admin.rpc("post_dice_roll", {
    p_user: userId,
    p_room: roomId,
    p_character: characterId,
    p_content: content,
    p_data: { verb: true, ...data },
  });
  return error
    ? {
        error:
          error.message.length < 140
            ? error.message
            : "Messaggio non pubblicato.",
      }
    : {};
}

async function inRoom(admin: Admin, roomId: string, characterId: string) {
  const { count } = await admin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId)
    .eq("character_id", characterId)
    .gte("created_at", freshSince());
  return !!count;
}

// Inizio del turno: i sanguinamenti tolgono i loro PF; lo stordito perde l'azione
async function startTurn(admin: Admin, f: Fighter, now: number) {
  const notes: string[] = [];
  const bleed = f.wounds.reduce((a, w) => a + w.bleed, 0);
  if (bleed > 0 && f.hp > 0) {
    await saveHp(admin, f, f.hp - bleed, now);
    notes.push(`sanguina e perde ${bleed} PF`);
    if (f.hp <= 0) notes.push("crolla a terra, morente");
  }
  let lost = false;
  if (f.c.stunned) {
    await admin.from("characters").update({ stunned: false }).eq("id", f.c.id);
    notes.push("è stordito e perde l'azione");
    lost = true;
  }
  return { notes, lost: lost || f.hp <= 0 };
}

async function me(characterId: string) {
  const { user } = await getStaffContext();
  const admin = createAdminClient();
  if (!admin)
    return { error: "Configurazione del server incompleta." } as const;
  const now = Date.now();
  const f = await loadFighter(admin, characterId, now);
  if (!f || f.c.owner_id !== user.id || f.c.status !== "attivo")
    return { error: "Personaggio non valido." } as const;
  return { user, admin, now, f } as const;
}

// Arma impugnata: valori con qualita' e chi la tiene; null = mani nude
function weaponOf(f: Fighter, g: Gear | null) {
  if (!g) {
    return {
      name: "a mani nude",
      skill: f.skillByName(COMBAT.skills.unarmed),
      damage: f.unarmed,
      hitBonus: 0,
      damageBonus: 0,
      pierce: 0,
      effects: [] as string[],
      ranged: false,
      dice: diceCount(f.unarmed),
    };
  }
  const q = g.quality ?? {
    hit_bonus: 0,
    damage_bonus: 0,
    pierce_bonus: 0,
    aff_bonus: 0,
    sp_bonus: 0,
  };
  const isShield = g.item.kind === "scudo";
  const damage = (isShield ? g.item.bash_dice : g.item.damage) ?? "1d6";
  const v = weaponValues(
    {
      damage,
      affMax: g.item.aff_max ?? 1,
      bodyMin: g.item.body_min,
      pierce: g.item.pierce,
    },
    {
      hit: q.hit_bonus,
      damage: q.damage_bonus,
      pierce: q.pierce_bonus,
      aff: q.aff_bonus,
      sp: q.sp_bonus,
    },
    f.stats.body,
  );
  return {
    name: `con ${g.item.name}`,
    skill: isShield
      ? f.skillByName(COMBAT.skills.shieldFree)
      : f.skillList.find((s) => s.id === g.item.weapon_skill_id),
    damage,
    hitBonus: v.hitBonus,
    damageBonus: v.damageBonus,
    pierce: v.pierce,
    effects: g.item.effects ?? [],
    ranged: g.item.weapon_category === "distanza",
    dice: diceCount(damage),
  };
}

// Usura: l'oggetto perde 1 AFF (armi, scudi) o 1 SP (armature)
async function wear(admin: Admin, g: Gear | null) {
  if (!g) return null;
  const d = durability(g.item, g.quality, g);
  if (!d) return null;
  const left = Math.max(0, d.current - 1);
  await admin
    .from("character_items")
    .update(d.label === "SP" ? { sp_current: left } : { aff_current: left })
    .eq("id", g.id);
  return left;
}

// ---------------------------------------------------------------------
// Attacca
// ---------------------------------------------------------------------
export type AttackOptions = {
  weaponId: string | null; // character_items.id di un'arma o scudo impugnato; null = mani nude
  kind: AttackKind;
  aimed?: LocationId; // attacco mirato
  distance?: number; // armi a distanza, metri
  cover?: boolean; // copertura parziale del bersaglio
  running?: boolean; // bersaglio che corre
  contact?: boolean; // arma a distanza contro un bersaglio a contatto
  mounted?: "cavallo" | "drago" | null;
  charge?: boolean; // carica in sella (effetto da_carica)
};

type AttackData = {
  weapon: string;
  weaponCi: string | null;
  kind: AttackKind;
  kindLabel: string;
  aimed: LocationId | null;
  ranged: boolean;
  dv: number | null;
  extreme: boolean;
  total: number;
  text: string;
  damage: string;
  damageBonus: number;
  pierce: number;
  effects: string[];
  charge: boolean;
  dice: number;
  attackerName: string;
};

export async function attack(
  roomId: string,
  characterId: string,
  targetId: string,
  o: AttackOptions,
): Promise<Result> {
  const ctx = await me(characterId);
  if ("error" in ctx) return { error: ctx.error };
  const { user, admin, now, f } = ctx;
  if (characterId === targetId)
    return { error: "Scegli un altro personaggio." };
  if (f.c.dead_at) return { error: "Il tuo personaggio è morto." };
  if (f.c.dying_since)
    return { error: "Il tuo personaggio è a terra: non può attaccare." };
  const t = await loadFighter(admin, targetId, now);
  if (!t || t.c.status !== "attivo")
    return { error: "Il bersaglio non è un personaggio attivo." };
  if (t.c.dead_at) return { error: `${t.c.name} è morto.` };
  if (!(await inRoom(admin, roomId, targetId)))
    return { error: `${t.c.name} non è in questa chat.` };

  const g = o.weaponId
    ? (f.equipped.find((x) => x.id === o.weaponId) ?? null)
    : null;
  if (o.weaponId && (!g || (g.item.kind !== "arma" && g.item.kind !== "scudo")))
    return {
      error:
        "Puoi attaccare solo con un'arma o uno scudo indossati (Equipaggiamento).",
    };
  const w = weaponOf(f, g);
  const shield = f.equipped.find((x) => x.item.kind === "scudo");
  if (g && g.item.kind === "arma" && g.item.hands === "2" && shield)
    return { error: "Un'arma a due mani non si usa con lo scudo." };
  if (g && (durability(g.item, g.quality, g)?.current ?? 1) <= 0)
    return { error: `${g.item.name} è rotta: va riparata dal fabbro.` };
  if (o.kind === "fast" && w.ranged)
    return { error: "L'attacco veloce è solo in mischia." };
  if (o.kind === "aimed" && !o.aimed) return { error: "Scegli dove mirare." };

  // Distanza: banda di gittata, munizioni, ricarica
  let dv: number | null = null;
  let extreme = false;
  let ammo: Gear | undefined;
  if (w.ranged && g) {
    const band = rangeBand(Math.max(0, o.distance ?? 0), g.item.range_m ?? 0);
    if (!band)
      return {
        error: `Troppo lontano: ${g.item.name} tira al massimo a ${(g.item.range_m ?? 0) * 2} m.`,
      };
    dv = band.dv + (o.running ? COMBAT.runningTargetDv : 0);
    extreme = "halfDamage" in band;
    if (g.item.reload_actions > 0 && !g.loaded)
      return { error: `${g.item.name} è scarica: usa Ricarica.` };
    if (g.item.ammo_type) {
      ammo = f.items.find(
        (x) =>
          x.item.kind === "munizione" &&
          x.item.ammo_type === g.item.ammo_type &&
          (x.charges ?? x.item.ammo_capacity ?? 0) > 0,
      );
      if (!ammo) return { error: `Non hai più ${g.item.ammo_type}.` };
    }
  }

  // Inizio turno: sanguinamenti e stordimento
  const turn = await startTurn(admin, f, now);
  if (turn.lost)
    return post(admin, user.id, roomId, characterId, turn.notes.join(", "), {
      dice: "turno",
    });

  // Stamina (a 0 si attacca comunque, con -3)
  const kindCfg = COMBAT.attackKinds[o.kind];
  const hits = o.kind === "fast" ? COMBAT.attackKinds.fast.hits : 1;
  const left = await spendStamina(admin, f, kindCfg.stamina * hits, now);

  // Modificatori
  const mods: Mod[] = [];
  if (f.encumbrance) mods.push({ label: "ingombro", value: f.encumbrance });
  if (w.hitBonus) mods.push({ label: "arma", value: w.hitBonus });
  const km = attackKindModifier(o.kind, w.effects, o.aimed);
  if (km) mods.push({ label: kindCfg.label.toLowerCase(), value: km });
  if (shield && g?.item.kind === "arma" && shield.item.attack_penalty)
    mods.push({ label: "scudo", value: shield.item.attack_penalty });
  if (f.armPenalty)
    mods.push({ label: "ferita al braccio", value: f.armPenalty });
  const charge = !!(o.charge && o.mounted && w.effects.includes("da_carica"));
  if (charge) mods.push({ label: "carica", value: COMBAT.charge.hit });
  if (w.ranged && o.contact)
    mods.push({ label: "a contatto", value: COMBAT.rangedMeleePenalty });
  if (w.ranged && o.cover)
    mods.push({ label: "copertura", value: COMBAT.coverPenalty });
  // in sella: vale il minore tra l'abilita' dell'arma ed Equitazione / Cavalcare un drago
  const ride = o.mounted
    ? f.level(
        f.skillByName(
          o.mounted === "drago"
            ? COMBAT.skills.dragonRiding
            : COMBAT.skills.riding,
        )?.id,
      )
    : undefined;

  // Munizioni e ricarica
  if (ammo) {
    const n = (ammo.charges ?? ammo.item.ammo_capacity ?? 0) - 1;
    await admin
      .from("character_items")
      .update({ charges: n })
      .eq("id", ammo.id);
  }
  if (g && w.ranged && g.item.reload_actions > 0)
    await admin
      .from("character_items")
      .update({ loaded: false, reload_progress: 0 })
      .eq("id", g.id);
  if (g && w.ranged && !g.item.ammo_type)
    // giavellotto: va recuperato
    await admin
      .from("character_items")
      .update({ equipped: false })
      .eq("id", g.id);

  const canDefend = !t.c.dying_since && !t.c.stabilized_at;
  const lines: string[] = [];
  const pendings: string[] = [];
  for (let i = 0; i < hits; i++) {
    const r = combatRoll(f, "ref", w.skill, mods, ride);
    // 1 naturale: l'arma di chi attacca perde 1 AFF
    if (r.natural === 1 && g) await wear(admin, g);
    const data: AttackData = {
      weapon: w.name.replace(/^con /, ""),
      weaponCi: g?.id ?? null,
      kind: o.kind,
      kindLabel: kindCfg.label,
      aimed: o.aimed ?? null,
      ranged: w.ranged,
      dv,
      extreme,
      total: r.total,
      text: r.text,
      damage: w.damage,
      damageBonus: w.damageBonus,
      pierce: w.pierce,
      effects: w.effects,
      charge,
      dice: w.dice,
      attackerName: f.c.name,
    };
    if (!canDefend) {
      // a terra, incosciente: non puo' difendersi, incassa
      lines.push(await resolveHit(admin, now, f, t, data, "take", null));
      continue;
    }
    const { data: row, error } = await admin
      .from("combat_attacks")
      .insert({
        room_id: roomId,
        attacker_id: characterId,
        target_id: targetId,
        data,
      })
      .select("id")
      .single();
    if (error) return { error: "Attacco non registrato." };
    pendings.push(row.id as string);
  }

  const what =
    `attacca ${t.c.name} ${w.name}` +
    (o.kind !== "normal"
      ? ` (attacco ${kindCfg.label.toLowerCase()}${o.aimed ? ` ${locationOf(o.aimed).to}` : ""})`
      : "") +
    (w.ranged && o.distance !== undefined ? ` da ${o.distance} m` : "") +
    (left <= 0 ? " (senza più Stamina)" : "");
  const content =
    (turn.notes.length ? turn.notes.join(", ") + "; poi " : "") +
    what +
    (pendings.length
      ? ` — ${t.c.name} deve difendersi${hits > 1 ? ` da ${hits} colpi` : ""}.`
      : `. ${lines.join(" ")}`);
  return post(admin, user.id, roomId, characterId, content, {
    dice: "attacco",
    pending: pendings,
  });
}

// ---------------------------------------------------------------------
// Difesa: risolve un attacco in attesa
// ---------------------------------------------------------------------
export async function defend(
  attackId: string,
  characterId: string,
  defense: DefenseKind,
  parryWith: string | null,
): Promise<Result> {
  const ctx = await me(characterId);
  if ("error" in ctx) return { error: ctx.error };
  const { user, admin, now, f } = ctx;
  const { data: a } = await admin
    .from("combat_attacks")
    .select("*")
    .eq("id", attackId)
    .maybeSingle();
  if (!a || a.target_id !== characterId)
    return { error: "Attacco non trovato." };
  if (a.resolved_at) return { error: "Questo attacco è già stato risolto." };
  const attacker = await loadFighter(admin, a.attacker_id as string, now);
  if (!attacker) return { error: "Attaccante non trovato." };
  // si "prenota" l'attacco: due difese contemporanee non lo risolvono due volte
  const { data: claimed } = await admin
    .from("combat_attacks")
    .update({ resolved_at: new Date(now).toISOString() })
    .eq("id", attackId)
    .is("resolved_at", null)
    .select("id");
  if (!claimed?.length) return { error: "Questo attacco è già stato risolto." };
  // a terra non ci si difende: si incassa
  const def = f.c.dying_since || f.c.dead_at ? "take" : defense;
  const line = await resolveHit(
    admin,
    now,
    attacker,
    f,
    a.data as AttackData,
    def,
    parryWith,
    attackId,
  );
  return post(admin, user.id, a.room_id as string, characterId, line, {
    dice: "difesa",
    attack: attackId,
  });
}

async function resolveHit(
  admin: Admin,
  now: number,
  att: Fighter,
  t: Fighter,
  a: AttackData,
  defense: DefenseKind,
  parryWith: string | null,
  attackId?: string,
): Promise<string> {
  const parts: string[] = [];
  let defTotal: number | null = null;
  let defText = "";
  let parryGear: Gear | null = null;
  let parryDice = 0;
  const shield = t.equipped.find((x) => x.item.kind === "scudo");
  // a distanza si para solo con lo scudo
  if (a.ranged && defense === "parry" && !shield) defense = "take";

  if (defense === "dodge") {
    await spendStamina(admin, t, COMBAT.defenses.dodge.stamina, now);
    const mods: Mod[] = [];
    if (t.encumbrance) mods.push({ label: "ingombro", value: t.encumbrance });
    if (t.legPenalty)
      mods.push({ label: "ferita alla gamba", value: t.legPenalty });
    const r = combatRoll(t, "ref", t.skillByName(COMBAT.skills.dodge), mods);
    defTotal = r.total;
    defText = `schiva (${r.text})`;
  } else if (defense === "parry") {
    await spendStamina(admin, t, COMBAT.defenses.parry.stamina, now);
    const weapons = t.equipped.filter(
      (x) => x.item.kind === "arma" && x.item.weapon_category !== "distanza",
    );
    const held = weapons.find((x) => x.id === parryWith) ?? weapons[0] ?? null;
    const usable =
      held && (durability(held.item, held.quality, held)?.current ?? 1) > 0
        ? held
        : null;
    const mods: Mod[] = [];
    if (t.encumbrance) mods.push({ label: "ingombro", value: t.encumbrance });
    if (t.armPenalty)
      mods.push({ label: "ferita al braccio", value: t.armPenalty });
    let skill = usable
      ? t.skillList.find((s) => s.id === usable.item.weapon_skill_id)
      : t.skillByName(COMBAT.skills.unarmed);
    if (shield) {
      // con lo scudo: abilita' dell'arma nell'altra mano (Armi da impatto se libera) + bonus dello scudo
      if (!usable) skill = t.skillByName(COMBAT.skills.shieldFree);
      mods.push({ label: "scudo", value: shield.item.parry_bonus });
      parryGear = shield;
      parryDice = diceCount(shield.item.bash_dice);
    } else {
      parryGear = usable;
      parryDice = diceCount(usable?.item.damage ?? t.unarmed);
    }
    if (usable?.item.effects?.includes("bilanciata"))
      mods.push({ label: "bilanciata", value: 1 });
    const r = combatRoll(t, "ref", skill, mods);
    defTotal = r.total;
    defText = `para${shield ? ` con ${shield.item.name}` : usable ? ` con ${usable.item.name}` : " a mani nude"} (${r.text})`;
  } else {
    defText = "incassa";
  }

  // Esito
  let hit: boolean;
  let margin: number;
  if (a.ranged) {
    const dv = a.dv ?? 10;
    const need = Math.max(dv, defTotal ?? 0);
    hit =
      defTotal !== null && defTotal > dv ? a.total > defTotal : a.total >= dv;
    margin = a.total - need;
  } else if (defTotal === null) {
    hit = true;
    margin = takeMargin(a.total);
  } else {
    hit = a.total > defTotal;
    margin = a.total - defTotal;
  }
  const vs = a.ranged
    ? `${a.total} contro ${defTotal !== null && defTotal > (a.dv ?? 0) ? defTotal : `DV ${a.dv}`}`
    : defTotal === null
      ? `${a.total}`
      : `${a.total} contro ${defTotal}`;
  parts.push(
    `${defText} l'attacco di ${a.attackerName} con ${a.weapon} (${a.text}): ${vs}`,
  );

  // Usura di chi para: attacco forte o arma con piu' dadi di danno
  if (
    defense === "parry" &&
    parryGear &&
    (a.kind === "strong" || a.dice > parryDice)
  ) {
    const left = await wear(admin, parryGear);
    if (left !== null) parts.push(`(${parryGear.item.name}: AFF ${left})`);
  }

  const attackerGear = a.weaponCi
    ? (att.items.find((x) => x.id === a.weaponCi) ?? null)
    : null;
  let outcome: Record<string, unknown> = { hit, margin, defense, defTotal };

  if (!hit) {
    parts.push("— mancato.");
  } else if (a.kind === "disarm") {
    if (margin >= COMBAT.attackKinds.disarm.disarmMargin) {
      const held = t.equipped.find((x) => x.item.kind === "arma");
      if (held) {
        await admin
          .from("character_items")
          .update({ equipped: false })
          .eq("id", held.id);
        parts.push(`— ${t.c.name} è disarmato: perde ${held.item.name}.`);
      } else parts.push("— a segno, ma non ha armi da perdere.");
    } else
      parts.push(
        `— a segno, ma il margine (${margin}) non basta per disarmare.`,
      );
  } else {
    // Locazione, dadi di danno, armatura
    const loc = a.aimed
      ? locationOf(a.aimed)
      : locationFromD10(Math.floor(rng() * 10) + 1);
    const dmg = rollDamageDice(a.damage, rng) ?? {
      total: 0,
      dice: [],
      bonus: 0,
      count: 0,
    };
    let diceTotal = Math.max(0, dmg.total);
    if (a.charge)
      diceTotal += rollDamageDice(COMBAT.charge.damage, rng)?.total ?? 0;
    const piece = t.armor[loc.armor as ArmorPart] ?? null;
    const sp = piece
      ? (durability(piece.item, piece.quality, piece)?.current ?? 0)
      : 0;
    const r = resolveDamage({
      diceTotal,
      damageBonus: a.damageBonus,
      attackKind: a.kind,
      location: loc.id,
      armorSp: sp,
      pierce: a.pierce,
      margin,
      extremeRange: a.extreme,
      effects: a.effects,
    });
    if (piece && r.newArmorSp !== sp)
      await admin
        .from("character_items")
        .update({ sp_current: r.newArmorSp })
        .eq("id", piece.id);

    // Ferite: critico e sanguinamento dell'arma
    const wounds: Record<string, unknown>[] = [];
    if (r.critical)
      wounds.push({
        character_id: t.c.id,
        location: loc.id,
        severity: r.critical.id,
        bleed: r.critical.bleed,
        penalty: r.critical.penalty,
        mutilated:
          r.critical.id === "mortal" && !["head", "torso"].includes(loc.id),
      });
    if (r.penetrates && a.effects.includes("sanguinante"))
      wounds.push({
        character_id: t.c.id,
        location: loc.id,
        severity: "bleeding",
        bleed: 1,
        penalty: 0,
      });
    if (wounds.length) await admin.from("character_wounds").insert(wounds);

    // Stordente: BODY + Robustezza + d10 contro DV 12
    let stunned = r.loseAction;
    let stunTxt = "";
    if (r.stunCheck) {
      const s = combatRoll(t, "body", t.skillByName(COMBAT.skills.stun), []);
      const ok = s.total >= COMBAT.stun.dv;
      stunTxt = ok
        ? ` Resiste allo stordimento (${s.total}).`
        : ` È stordito (${s.total} contro DV ${COMBAT.stun.dv}): perde la prossima azione.`;
      if (!ok) stunned = true;
    }
    // Lancia da giostra e simili: si spezzano al colpo
    if (attackerGear && a.effects.includes("si_spezza"))
      await wear(admin, attackerGear);

    const newHp = await saveHp(admin, t, t.hp - r.hpLost, now, {
      ...(stunned ? { stunned: true } : {}),
      ...(r.instantDeath
        ? { dead_at: new Date(now).toISOString(), dying_since: null }
        : {}),
    });
    parts.push(
      `— colpito ${loc.to}: ${r.hpLost} danni` +
        ` (${r.log.join(", ")}).` +
        (r.critical
          ? ` Ferita ${r.critical.label.toLowerCase()}${r.critical.bleed ? `, sanguina ${r.critical.bleed} PF a round` : ""}.`
          : "") +
        (r.penetrates && a.effects.includes("sanguinante")
          ? " L'arma lo fa sanguinare."
          : "") +
        (piece && r.newArmorSp !== sp
          ? ` ${piece.item.name}: SP ${r.newArmorSp}.`
          : "") +
        stunTxt +
        (r.loseAction ? " Perde la prossima azione." : "") +
        (r.instantDeath
          ? ` ${t.c.name} muore sul colpo.`
          : newHp <= 0
            ? ` ${t.c.name} crolla a terra, morente.`
            : ""),
    );
    outcome = { ...outcome, location: loc.id, damage: r, hp: newHp };
  }
  if (attackId)
    await admin.from("combat_attacks").update({ outcome }).eq("id", attackId);
  return parts.join(" ");
}

// ---------------------------------------------------------------------
// Altre azioni
// ---------------------------------------------------------------------
export async function catchBreath(
  roomId: string,
  characterId: string,
): Promise<Result> {
  const ctx = await me(characterId);
  if ("error" in ctx) return { error: ctx.error };
  const { user, admin, now, f } = ctx;
  if (f.c.dead_at || f.c.dying_since)
    return { error: "Il personaggio è a terra." };
  const turn = await startTurn(admin, f, now);
  if (turn.lost)
    return post(admin, user.id, roomId, characterId, turn.notes.join(", "), {
      dice: "turno",
    });
  const left = Math.min(f.maxStamina, f.stamina + f.rec);
  await admin
    .from("characters")
    .update({
      stamina_current: left,
      stamina_updated_at: new Date(now).toISOString(),
    })
    .eq("id", characterId);
  return post(
    admin,
    user.id,
    roomId,
    characterId,
    (turn.notes.length ? turn.notes.join(", ") + "; poi " : "") +
      `riprende fiato: Stamina ${left}/${f.maxStamina}.`,
    { dice: "fiato" },
  );
}

export async function rollInitiative(
  roomId: string,
  characterId: string,
): Promise<Result> {
  const ctx = await me(characterId);
  if ("error" in ctx) return { error: ctx.error };
  const { user, admin, f } = ctx;
  const mods: Mod[] = [];
  if (f.encumbrance) mods.push({ label: "ingombro", value: f.encumbrance });
  const ini = f.traits(null, "ref", "initiative");
  if (ini) mods.push({ label: "tratti", value: ini });
  const roll = rollD10(rng);
  const total =
    f.stats.ref + mods.reduce((a, m) => a + m.value, 0) + roll.total;
  return post(
    admin,
    user.id,
    roomId,
    characterId,
    `tira l'iniziativa: RIF ${f.stats.ref}` +
      mods
        .map(
          (m) => ` ${m.value >= 0 ? "+" : "−"} ${Math.abs(m.value)} ${m.label}`,
        )
        .join("") +
      ` + d10 ${roll.rolls.length > 1 ? `[${roll.rolls.join(", ")}]` : roll.total} = ${total}.`,
    { dice: "iniziativa", total, ref: f.stats.ref },
  );
}

export async function reload(
  roomId: string,
  characterId: string,
  weaponId: string,
): Promise<Result> {
  const ctx = await me(characterId);
  if ("error" in ctx) return { error: ctx.error };
  const { user, admin, now, f } = ctx;
  const g = f.equipped.find((x) => x.id === weaponId);
  if (!g || g.item.reload_actions <= 0)
    return { error: "Quest'arma non si ricarica." };
  if (g.loaded) return { error: `${g.item.name} è già carica.` };
  const turn = await startTurn(admin, f, now);
  if (turn.lost)
    return post(admin, user.id, roomId, characterId, turn.notes.join(", "), {
      dice: "turno",
    });
  const progress = g.reload_progress + 1;
  const done = progress >= g.item.reload_actions;
  await admin
    .from("character_items")
    .update(
      done
        ? { loaded: true, reload_progress: 0 }
        : { reload_progress: progress },
    )
    .eq("id", g.id);
  return post(
    admin,
    user.id,
    roomId,
    characterId,
    `ricarica ${g.item.name}` +
      (done
        ? ": è pronta a tirare."
        : ` (${progress}/${g.item.reload_actions}).`),
    { dice: "ricarica" },
  );
}

export async function deathSave(
  roomId: string,
  characterId: string,
): Promise<Result> {
  const ctx = await me(characterId);
  if ("error" in ctx) return { error: ctx.error };
  const { user, admin, now, f } = ctx;
  if (f.c.dead_at) return { error: "Il personaggio è morto." };
  if (!f.c.dying_since || f.c.stabilized_at)
    return { error: "Il personaggio non è morente." };
  if (!f.c.dying_save_due)
    return {
      error: "Hai già fatto il tiro salvezza: ora tocca alla tua azione.",
    };
  const round = f.c.dying_round + 1;
  const dv = dyingDv(round);
  const roll = rollD10(rng);
  const total = f.stats.body + f.stats.will + roll.total;
  const ok = total >= dv;
  await admin
    .from("characters")
    .update(
      ok
        ? { dying_round: round, dying_save_due: false }
        : { dead_at: new Date(now).toISOString(), dying_save_due: false },
    )
    .eq("id", characterId);
  return post(
    admin,
    user.id,
    roomId,
    characterId,
    `tenta il tiro salvezza (round ${round}): BODY ${f.stats.body} + TEM ${f.stats.will} + d10 ${roll.total} = ${total} contro DV ${dv} — ` +
      (ok ? "resiste ancora." : "non ce la fa e muore."),
    { dice: "salvezza", round, total, dv, ok },
  );
}

// Medicina: stabilizzare un morente (DV 15) o fermare un sanguinamento (Primo soccorso)
function medicine(f: Fighter, dv: number) {
  const kit = f.items.some(
    (x) => x.item.name.toLowerCase() === "kit del maestro",
  );
  const r = combatRoll(
    f,
    "int",
    f.skillByName(COMBAT.skills.medicine),
    kit ? [{ label: "kit del maestro", value: 2 }] : [],
  );
  return { ...r, ok: r.total >= dv };
}

export async function stabilize(
  roomId: string,
  characterId: string,
  targetId: string,
): Promise<Result> {
  const ctx = await me(characterId);
  if ("error" in ctx) return { error: ctx.error };
  const { user, admin, now, f } = ctx;
  if (f.c.dying_since || f.c.dead_at)
    return { error: "Il tuo personaggio è a terra." };
  const t = await loadFighter(admin, targetId, now);
  if (!t || !t.c.dying_since || t.c.stabilized_at || t.c.dead_at)
    return { error: "Il personaggio non è morente." };
  if (!(await inRoom(admin, roomId, targetId)))
    return { error: `${t.c.name} non è in questa chat.` };
  const r = medicine(f, COMBAT.stabilizeDv);
  let hours = 0;
  if (r.ok) {
    hours = Math.floor(rng() * 6) + 1;
    await admin
      .from("characters")
      .update({
        stabilized_at: new Date(now).toISOString(),
        dying_save_due: false,
        hp_updated_at: new Date(now).toISOString(),
      })
      .eq("id", targetId);
  }
  return post(
    admin,
    user.id,
    roomId,
    characterId,
    `cerca di stabilizzare ${t.c.name}: ${r.text} contro DV ${COMBAT.stabilizeDv} — ` +
      (r.ok
        ? `ci riesce. ${t.c.name} resta incosciente per ${hours} ${hours === 1 ? "ora" : "ore"}.`
        : "non ci riesce."),
    { dice: "stabilizza", ok: r.ok, hours },
  );
}

export async function firstAid(
  roomId: string,
  characterId: string,
  targetId: string,
  woundId: string,
): Promise<Result> {
  const ctx = await me(characterId);
  if ("error" in ctx) return { error: ctx.error };
  const { user, admin, now, f } = ctx;
  if (f.c.dying_since || f.c.dead_at)
    return { error: "Il tuo personaggio è a terra." };
  if (!f.items.some((x) => x.item.name.toLowerCase() === "bende"))
    return { error: "Per il Primo soccorso servono delle bende." };
  const t =
    targetId === characterId ? f : await loadFighter(admin, targetId, now);
  if (!t) return { error: "Personaggio non trovato." };
  if (targetId !== characterId && !(await inRoom(admin, roomId, targetId)))
    return { error: `${t.c.name} non è in questa chat.` };
  const w = t.wounds.find((x) => x.id === woundId);
  if (!w || w.bleed <= 0) return { error: "Questa ferita non sanguina." };
  const dv = t.c.dying_since
    ? COMBAT.firstAidDv.grave
    : (COMBAT.firstAidDv[w.severity] ?? 10);
  const r = medicine(f, dv);
  if (r.ok) {
    if (w.severity === "bleeding")
      await admin.from("character_wounds").delete().eq("id", w.id);
    else
      await admin.from("character_wounds").update({ bleed: 0 }).eq("id", w.id);
  }
  return post(
    admin,
    user.id,
    roomId,
    characterId,
    `presta il primo soccorso a ${t.c.id === f.c.id ? "se stesso" : t.c.name} (${locationLabel(w.location)}): ${r.text} contro DV ${dv} — ` +
      (r.ok ? "il sangue si ferma." : "non ci riesce."),
    { dice: "soccorso", ok: r.ok },
  );
}

const locationLabel = (id: string) =>
  COMBAT.locations.find((l) => l.id === id)?.label.toLowerCase() ?? id;

// ---------------------------------------------------------------------
// Stato per la finestra Combattimento della chat
// ---------------------------------------------------------------------
export async function combatStatus(
  roomId: string,
  characterId: string,
  others: string[],
) {
  const ctx = await me(characterId);
  if ("error" in ctx) return { error: ctx.error };
  const { admin, now, f } = ctx;
  const { data: pending } = await admin
    .from("combat_attacks")
    .select("id, data, created_at")
    .eq("room_id", roomId)
    .eq("target_id", characterId)
    .is("resolved_at", null)
    .order("created_at");
  const bleeding = (x: Fighter) =>
    x.wounds
      .filter((w) => w.bleed > 0)
      .map((w) => ({
        id: w.id,
        label: `${locationLabel(w.location)} (${w.bleed} PF a round)`,
      }));
  const near = await Promise.all(
    others.slice(0, 30).map(async (id) => {
      const o = await loadFighter(admin, id, now);
      if (!o) return null;
      return {
        id,
        name: o.c.name,
        state: hpState(o.c, o.hp, o.maxHp),
        bleeding: bleeding(o),
      };
    }),
  );
  return {
    me: {
      hp: f.hp,
      maxHp: f.maxHp,
      stamina: f.stamina,
      maxStamina: f.maxStamina,
      state: hpState(f.c, f.hp, f.maxHp),
      dyingSaveDue:
        !!f.c.dying_since && !f.c.stabilized_at && f.c.dying_save_due,
      stunned: f.c.stunned,
      encumbrance: f.encumbrance,
      bleeding: bleeding(f),
      hasBandages: f.items.some((x) => x.item.name.toLowerCase() === "bende"),
      weapons: f.equipped
        .filter((g) => g.item.kind === "arma" || g.item.kind === "scudo")
        .map((g) => {
          const d = durability(g.item, g.quality, g);
          return {
            id: g.id,
            name: g.item.name,
            kind: g.item.kind,
            ranged: g.item.weapon_category === "distanza",
            range: g.item.range_m,
            reload: g.item.reload_actions,
            loaded: g.loaded,
            aff: d ? `${d.current}/${d.max}` : null,
            effects: g.item.effects ?? [],
          };
        }),
    },
    pending: (pending ?? []).map((p) => {
      const d = p.data as AttackData;
      return {
        id: p.id as string,
        attacker: d.attackerName,
        weapon: d.weapon,
        kind: d.kindLabel,
        ranged: d.ranged,
        aimed: d.aimed ? locationOf(d.aimed).label : null,
      };
    }),
    others: near.filter((x): x is NonNullable<typeof x> => !!x),
  };
}

// Avviso nella chat: attacchi da cui difendersi e tiro salvezza da fare
export async function combatAlerts(roomId: string, characterId: string) {
  const ctx = await me(characterId);
  if ("error" in ctx) return { attackers: [] as string[], dying: false };
  const { admin, f } = ctx;
  const { data } = await admin
    .from("combat_attacks")
    .select("data")
    .eq("room_id", roomId)
    .eq("target_id", characterId)
    .is("resolved_at", null);
  return {
    attackers: [
      ...new Set((data ?? []).map((d) => (d.data as AttackData).attackerName)),
    ],
    dying:
      !!f.c.dying_since &&
      !f.c.stabilized_at &&
      !f.c.dead_at &&
      f.c.dying_save_due,
  };
}
