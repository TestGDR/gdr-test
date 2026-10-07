// =====================================================================
// MOTORE DELLE REGOLE - modulo puro: niente database, niente rete.
// Riceve dati e restituisce risultati (con il log dei tiri da mostrare).
// Il generatore casuale si passa come parametro (con seme per i test).
// =====================================================================

import { RULES, STAT_IDS, type StatId } from "./config.ts";

export type Rng = () => number; // numero in [0, 1)
export type Stats = Record<StatId, number>;

// Generatore con seme (mulberry32): stessi semi, stessi tiri
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const die = (rng: Rng) => Math.floor(rng() * RULES.die.sides) + 1;

// ---------------------------------------------------------------------
// 1. d10 che esplode: con 10 si tira ancora e si somma (finche' esce 10);
//    con 1 si tira ancora una volta e si sottrae
// ---------------------------------------------------------------------
export type D10Result = { total: number; rolls: number[]; event: "esplosione" | "fallimento" | "nessuno" };

export function rollD10(rng: Rng): D10Result {
  const first = die(rng);
  const rolls = [first];
  if (first === RULES.die.fumbleOn) {
    const minus = die(rng);
    rolls.push(minus);
    return { total: first - minus, rolls, event: "fallimento" };
  }
  let total = first;
  let last = first;
  while (last === RULES.die.explodeOn) {
    last = die(rng);
    rolls.push(last);
    total += last;
  }
  return { total, rolls, event: rolls.length > 1 ? "esplosione" : "nessuno" };
}

// ---------------------------------------------------------------------
// Modificatori dei tratti: la loro somma resta tra -3 e +3
// ---------------------------------------------------------------------
export function capTraitModifiers(mods: number[]) {
  const sum = mods.reduce((a, b) => a + b, 0);
  return Math.max(-RULES.traitCap, Math.min(RULES.traitCap, sum));
}

// ---------------------------------------------------------------------
// 2. Prova: STAT + ABILITA' + modificatori + d10, contro una DV (riesce se
//    il totale la raggiunge) o contro il totale di un avversario (a parita'
//    vince chi difende)
// ---------------------------------------------------------------------
export type CheckInput = {
  stat: number;
  skill: number;
  traitMods?: number[]; // modificatori dei tratti (tetto +-3 sul totale)
  otherMods?: number[]; // altri modificatori (ferite, fatica, situazione...)
  target: { dv: number } | { opposed: number };
};
export type CheckResult = {
  total: number;
  roll: D10Result;
  traits: number;
  others: number;
  target: number;
  margin: number;
  success: boolean;
  log: string;
};

export function check(input: CheckInput, rng: Rng): CheckResult {
  const roll = rollD10(rng);
  const traits = capTraitModifiers(input.traitMods ?? []);
  const others = (input.otherMods ?? []).reduce((a, b) => a + b, 0);
  const total = input.stat + input.skill + traits + others + roll.total;
  const isDv = "dv" in input.target;
  const target = isDv ? (input.target as { dv: number }).dv : (input.target as { opposed: number }).opposed;
  const success = isDv ? total >= target : total > target;
  const margin = total - target;
  const sign = (n: number) => (n >= 0 ? `+ ${n}` : `− ${-n}`);
  const dice = roll.rolls.length > 1 ? `d10 [${roll.rolls.join(roll.event === "fallimento" ? " − " : " + ")}] = ${roll.total}` : `d10 ${roll.total}`;
  const log =
    `${input.stat} (stat) + ${input.skill} (abilità)` +
    (traits ? ` ${sign(traits)} (tratti)` : "") +
    (others ? ` ${sign(others)} (modificatori)` : "") +
    ` + ${dice} = ${total} contro ${isDv ? "DV " : ""}${target}: ` +
    (success ? "riuscito" : "fallito") +
    ` (margine ${margin >= 0 ? "+" : ""}${margin})`;
  return { total, roll, traits, others, target, margin, success, log };
}

// ---------------------------------------------------------------------
// 3. Statistiche derivate
// ---------------------------------------------------------------------
export type Derived = {
  hp: number;
  stamina: number;
  rec: number;
  run: number; // metri a round
  jump: number; // metri, con rincorsa
  jumpStanding: number; // metri, da fermo
  carry: number; // kg senza malus
  unarmed: string; // danno a mani nude
};

const avgUp = (a: number, b: number) => Math.ceil((a + b) / 2);

export function deriveStats(stats: Stats, hpBonus = 0): Derived {
  const d = RULES.derived;
  const rec = avgUp(stats.body, stats.will);
  const hp = d.hpPerPoint * rec + hpBonus;
  const run = Math.ceil(((stats.ref + stats.body) / 2) * d.runPerPoint);
  const jump = run / d.jumpDivisor;
  const unarmed = d.unarmed.find((u) => stats.body <= u.maxBody) ?? d.unarmed[d.unarmed.length - 1];
  return {
    hp,
    stamina: hp,
    rec,
    run,
    jump: Math.round(jump * 10) / 10,
    jumpStanding: Math.round((jump / d.jumpDivisor) * 10) / 10,
    carry: stats.body * d.carryPerBody,
    unarmed: unarmed.damage,
  };
}

// ---------------------------------------------------------------------
// 4. Validazione della creazione: restituisce l'elenco degli errori
// ---------------------------------------------------------------------
export type TraitPick = { kind: "vantaggio" | "svantaggio"; cost: number; name: string; uniqueGroup?: string | null };

export function statPointsUsed(stats: Partial<Stats>) {
  return STAT_IDS.reduce((sum, id) => sum + (stats[id] ?? 0), 0);
}
export function skillPointsUsed(skills: Record<string, number>) {
  return Object.values(skills).reduce((a, b) => a + (b || 0), 0);
}
// Limiti dei tratti alla creazione (di base quelli del regolamento;
// la creazione configurabile puo' cambiarli)
export type TraitLimits = { advantagePoints: number; flawsMax: number; flawValueMax: number; advantagesMax: number };

export function traitBudget(traits: TraitPick[], c: TraitLimits = RULES.creation) {
  const flawValue = traits.filter((t) => t.kind === "svantaggio").reduce((a, t) => a + t.cost, 0);
  const spent = traits.filter((t) => t.kind === "vantaggio").reduce((a, t) => a + t.cost, 0);
  return { available: c.advantagePoints + Math.min(flawValue, c.flawValueMax), spent, flawValue };
}

export function validateStats(stats: Partial<Stats>): string[] {
  const c = RULES.creation;
  const errors: string[] = [];
  for (const s of RULES.stats) {
    const v = stats[s.id];
    if (v === undefined || !Number.isInteger(v)) errors.push(`${s.label}: valore mancante.`);
    else if (v < c.statMin) errors.push(`${s.label}: minimo ${c.statMin}.`);
    else if (v > c.statMax) errors.push(`${s.label}: massimo ${c.statMax}.`);
  }
  const used = statPointsUsed(stats);
  if (used !== c.statPoints) errors.push(`Le statistiche devono sommare ${c.statPoints} punti (ora ${used}).`);
  return errors;
}

export function validateSkills(skills: Record<string, number>, names: Record<string, string> = {}): string[] {
  const c = RULES.creation;
  const errors: string[] = [];
  for (const [id, v] of Object.entries(skills)) {
    if (!Number.isInteger(v) || v < 0) errors.push(`${names[id] ?? id}: valore non valido.`);
    else if (v > c.skillMax) errors.push(`${names[id] ?? id}: massimo ${c.skillMax} alla creazione.`);
  }
  const used = skillPointsUsed(skills);
  if (used !== c.skillPoints) errors.push(`Le abilità devono usare ${c.skillPoints} punti (ora ${used}).`);
  return errors;
}

export function validateTraits(traits: TraitPick[], c: TraitLimits = RULES.creation): string[] {
  const errors: string[] = [];
  const flaws = traits.filter((t) => t.kind === "svantaggio");
  const advantages = traits.filter((t) => t.kind === "vantaggio");
  const { available, spent, flawValue } = traitBudget(traits, c);
  if (flaws.length > c.flawsMax) errors.push(`Puoi prendere al massimo ${c.flawsMax} svantaggi.`);
  if (flawValue > c.flawValueMax) errors.push(`Gli svantaggi possono valere al massimo ${c.flawValueMax} punti in tutto.`);
  if (advantages.length > c.advantagesMax) errors.push(`Puoi prendere al massimo ${c.advantagesMax} vantaggi.`);
  if (spent > available) errors.push(`I vantaggi costano ${spent} punti, ne hai ${available}.`);
  const names = traits.map((t) => t.name);
  if (new Set(names).size !== names.length) errors.push("Ogni tratto si prende una volta sola.");
  const groups = traits.map((t) => t.uniqueGroup).filter(Boolean);
  for (const g of new Set(groups))
    if (groups.filter((x) => x === g).length > 1)
      errors.push(`Puoi avere un solo tratto tra: ${traits.filter((t) => t.uniqueGroup === g).map((t) => t.name).join(", ")}.`);
  return errors;
}

export function validateCharacter(stats: Partial<Stats>, skills: Record<string, number>, traits: TraitPick[]): string[] {
  return [...validateStats(stats), ...validateSkills(skills), ...validateTraits(traits)];
}

// ---------------------------------------------------------------------
// 5. Esperienza: per salire al livello N servono N x 10 PX
// ---------------------------------------------------------------------
export function pxCostForNext(level: number) {
  return RULES.px.costPerLevel * (level + 1);
}

export function spendPX(px: number, level: number): { ok: true; cost: number; px: number; level: number } | { ok: false; error: string } {
  if (level >= RULES.skillMax) return { ok: false, error: `L'abilità è già al livello massimo (${RULES.skillMax}).` };
  const cost = pxCostForNext(level);
  if (px < cost) return { ok: false, error: `Servono ${cost} PX, ne hai ${px}.` };
  return { ok: true, cost, px: px - cost, level: level + 1 };
}
