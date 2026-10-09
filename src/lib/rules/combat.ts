// =====================================================================
// MOTORE DEL COMBATTIMENTO - modulo puro (niente database).
// Riceve i dati, restituisce i risultati e le modifiche da salvare
// (PF, SP, AFF, ferite): le salva chi lo chiama.
// =====================================================================

import {
  COMBAT,
  type AttackKind,
  type LocationId,
  type WoundSeverity,
} from "./combat-config.ts";
import type { Rng } from "./engine.ts";

// Bonus di un livello di qualita' (Gestione -> Oggetti -> Qualita')
export type QualityBonus = {
  hit: number;
  damage: number;
  pierce: number;
  aff: number;
  sp: number;
};
export const NO_BONUS: QualityBonus = {
  hit: 0,
  damage: 0,
  pierce: 0,
  aff: 0,
  sp: 0,
};

// ---------------------------------------------------------------------
// Valori di un'arma posseduta (catalogo + qualita' + chi la impugna)
// ---------------------------------------------------------------------
export type WeaponStats = {
  damage: string; // dadi, es. "4d6"
  affMax: number;
  bodyMin: number;
  pierce: number; // effetto perforante dell'arma
};

export function weaponValues(w: WeaponStats, q: QualityBonus, body: number) {
  const bodyPenalty = Math.max(0, w.bodyMin - body);
  return {
    hitBonus: q.hit - bodyPenalty,
    bodyPenalty,
    damageBonus: q.damage,
    pierce: w.pierce + q.pierce,
    affMax: w.affMax + q.aff,
  };
}

// Dadi di danno (non esplodono): "4d6", "1d6+2", "1d6-4", "3"
export function rollDamageDice(formula: string, rng: Rng) {
  const f = formula.replace(/\s+/g, "").replace("−", "-").toLowerCase();
  const m = /^(\d*)d(\d+)([+-]\d+)?$|^(\d+)$/.exec(f);
  if (!m) return null;
  if (m[4])
    return { total: Number(m[4]), dice: [] as number[], bonus: 0, count: 0 };
  const count = Number(m[1] || 1);
  const sides = Number(m[2]);
  const bonus = Number(m[3] || 0);
  const dice = Array.from(
    { length: count },
    () => Math.floor(rng() * sides) + 1,
  );
  return { total: dice.reduce((a, b) => a + b, 0) + bonus, dice, bonus, count };
}

// Numero di dadi di danno (per l'usura: arma con piu' dadi della propria)
export function diceCount(formula: string | null | undefined) {
  const m = /^(\d*)d/i.exec((formula ?? "").trim());
  return m ? Number(m[1] || 1) : 0;
}

export function locationFromD10(n: number) {
  return COMBAT.locations.find((l) =>
    (l.d10 as readonly number[]).includes(n),
  )!;
}
export function location(id: LocationId) {
  return COMBAT.locations.find((l) => l.id === id)!;
}

export function criticalWound(margin: number) {
  return (
    COMBAT.criticals.find((c) => margin >= c.min && margin <= c.max) ?? null
  );
}

// ---------------------------------------------------------------------
// Calcolo dei danni (sezione 6, nell'ordine dei passi)
// ---------------------------------------------------------------------
export type DamageInput = {
  diceTotal: number; // somma dei dadi di danno gia' tirati
  damageBonus?: number; // bonus danno della qualita'
  attackKind: AttackKind;
  location: LocationId;
  armorSp: number; // SP attuale del pezzo in quella locazione
  pierce?: number; // perforante totale (arma + qualita')
  margin: number;
  extremeRange?: boolean;
  effects?: readonly string[];
};

export type DamageResult = {
  baseDamage: number;
  effectiveSp: number;
  afterArmor: number;
  penetrates: boolean;
  multiplier: number;
  afterMultiplier: number;
  critical: {
    id: WoundSeverity;
    label: string;
    bonus: number;
    penalty: number;
    bleed: number;
  } | null;
  hpLost: number;
  newArmorSp: number;
  bleed: number; // PF a round da aggiungere (critico + Sanguinante)
  stunCheck: boolean; // Stordente: il bersaglio deve tirare
  instantDeath: boolean; // critico mortale a testa o tronco
  loseAction: boolean; // critico grave a testa o tronco
  log: string[];
};

export function resolveDamage(i: DamageInput): DamageResult {
  const log: string[] = [];
  const loc = location(i.location);
  // 1. danno base (+ qualita'; forte x1,5; estrema gittata dimezzato)
  let base = i.diceTotal + (i.damageBonus ?? 0);
  if (i.attackKind === "strong")
    base = Math.ceil(base * COMBAT.attackKinds.strong.damageMultiplier);
  if (i.extremeRange) base = Math.ceil(base / 2);
  log.push(`danno ${base}`);
  // 2. SP effettivo
  const effectiveSp = Math.max(0, i.armorSp - (i.pierce ?? 0));
  // 3. dopo l'armatura
  const afterArmor = Math.max(0, base - effectiveSp);
  const penetrates = afterArmor > 0;
  if (i.armorSp > 0)
    log.push(
      `SP ${i.armorSp}${i.pierce ? ` − ${i.pierce} perforante` : ""} → ${afterArmor}`,
    );
  // 4. moltiplicatore di locazione
  const afterMultiplier = Math.ceil(afterArmor * loc.multiplier);
  if (loc.multiplier !== 1)
    log.push(
      `${loc.label.toLowerCase()} ×${loc.multiplier.toLocaleString("it-IT")} → ${afterMultiplier}`,
    );
  // 5. ferita critica (anche se non penetra)
  const crit = criticalWound(i.margin);
  if (crit) log.push(`ferita ${crit.label.toLowerCase()} +${crit.bonus}`);
  const core = loc.id === "head" || loc.id === "torso";
  // 6. usura dell'armatura
  const newArmorSp = penetrates ? Math.max(0, i.armorSp - 1) : i.armorSp;
  // 7. effetti dell'arma (solo se penetra)
  const effects = i.effects ?? [];
  const bleed =
    (crit?.bleed ?? 0) +
    (penetrates && effects.includes("sanguinante") ? 1 : 0);
  const stunCheck =
    penetrates &&
    effects.includes("stordente") &&
    i.margin >= COMBAT.stun.margin;
  return {
    baseDamage: base,
    effectiveSp,
    afterArmor,
    penetrates,
    multiplier: loc.multiplier,
    afterMultiplier,
    critical: crit
      ? {
          id: crit.id,
          label: crit.label,
          bonus: crit.bonus,
          penalty: crit.penalty,
          bleed: crit.bleed,
        }
      : null,
    hpLost: afterMultiplier + (crit?.bonus ?? 0),
    newArmorSp,
    bleed,
    stunCheck,
    instantDeath: !!crit && "deathIfCore" in crit && core,
    loseAction: !!crit && "loseActionIfCore" in crit && core,
    log,
  };
}

// ---------------------------------------------------------------------
// Distanza (sezione 5): banda di gittata e DV
// ---------------------------------------------------------------------
export function rangeBand(distance: number, range: number) {
  if (range <= 0) return null;
  return COMBAT.rangeBands.find((b) => distance <= range * b.upTo) ?? null;
}

// Margine quando si incassa: attacco − 10, minimo 0
export function takeMargin(attackTotal: number) {
  return Math.max(0, attackTotal - COMBAT.takeMarginBase);
}

// Morente: DV del tiro salvezza al round N (1 = primo)
export function dyingDv(round: number) {
  return COMBAT.dying.dv + COMBAT.dying.perRound * Math.max(0, round - 1);
}

// Modificatore al colpire per tipo di attacco
export function attackKindModifier(
  kind: AttackKind,
  effects: readonly string[],
  aimed?: LocationId,
) {
  if (kind === "fast")
    return effects.includes("rapida")
      ? COMBAT.attackKinds.fast.hitRapida
      : COMBAT.attackKinds.fast.hit;
  if (kind === "aimed") return aimed ? location(aimed).aimPenalty : 0;
  return COMBAT.attackKinds[kind].hit;
}

// Costo di un pezzo d'armatura dal costo del set (corazza meta', gli altri un sesto,
// arrotondato per eccesso a 0,5)
export function armorPieceCost(
  setCost: number,
  part: "testa" | "tronco" | "braccia" | "gambe",
) {
  const share = part === "tronco" ? setCost / 2 : setCost / 6;
  return Math.ceil(share * 2) / 2;
}

// Usura di un oggetto posseduto: AFF per armi e scudi, SP per le armature
// (vuoto = pieno). Il massimo comprende il bonus della qualita'.
export function durability(
  item: {
    kind?: string | null;
    aff_max?: number | null;
    sp_max?: number | null;
  },
  quality: { aff_bonus?: number | null; sp_bonus?: number | null } | null,
  owned: { aff_current?: number | null; sp_current?: number | null },
) {
  if (item.kind === "armatura" && item.sp_max != null) {
    const max = item.sp_max + (quality?.sp_bonus ?? 0);
    return {
      label: "SP",
      max,
      current: Math.min(max, owned.sp_current ?? max),
    };
  }
  if ((item.kind === "arma" || item.kind === "scudo") && item.aff_max != null) {
    const max = item.aff_max + (quality?.aff_bonus ?? 0);
    return {
      label: "AFF",
      max,
      current: Math.min(max, owned.aff_current ?? max),
    };
  }
  return null;
}
