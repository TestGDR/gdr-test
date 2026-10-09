import { COMBAT } from "./combat-config.ts";

// Punti ferita e Stamina attuali, calcolati al momento (documento
// "Combattimento, armi e danni"):
// - hp null = PF pieni; i PF non scendono sotto 0
// - ogni giorno intero da hp_updated_at si recuperano tanti PF quanto il
//   Recupero (fino al massimo); non recuperano i morti e i morenti non
//   ancora stabilizzati
// - la Stamina torna piena dopo 10 minuti senza azioni di combattimento
export const DAY_MS = 24 * 60 * 60 * 1000;

export type HpRecord = {
  hp_current?: number | null;
  hp_updated_at?: string | null;
  stamina_current?: number | null;
  stamina_updated_at?: string | null;
  dead_at?: string | null;
  dying_since?: string | null;
  stabilized_at?: string | null;
};

export function recoveredHp(
  c: HpRecord,
  maxHp: number,
  rec: number,
  now: number,
) {
  if (c.hp_current === null || c.hp_current === undefined)
    return { hp: maxHp, since: null as number | null };
  const hp0 = Math.max(0, Math.min(maxHp, c.hp_current));
  const from = c.hp_updated_at ? Date.parse(c.hp_updated_at) : now;
  if (c.dead_at || (c.dying_since && !c.stabilized_at))
    return { hp: hp0, since: from };
  const days = Math.max(0, Math.floor((now - from) / DAY_MS));
  const hp = Math.min(maxHp, hp0 + days * Math.max(0, rec));
  // il resto del giorno non ancora compiuto non si perde
  return { hp, since: hp >= maxHp ? null : from + days * DAY_MS };
}

export function currentHp(
  c: HpRecord,
  maxHp: number,
  rec: number,
  now: number,
) {
  return recoveredHp(c, maxHp, rec, now).hp;
}

export function currentStamina(c: HpRecord, maxStamina: number, now: number) {
  if (c.stamina_current === null || c.stamina_current === undefined)
    return maxStamina;
  const last = c.stamina_updated_at ? Date.parse(c.stamina_updated_at) : 0;
  if (now - last >= COMBAT.staminaRestMinutes * 60_000) return maxStamina;
  return Math.max(0, Math.min(maxStamina, c.stamina_current));
}

export type HpState =
  "illeso" | "ferito" | "morente" | "stabilizzato" | "morto";

export function hpState(c: HpRecord, hp: number, maxHp: number): HpState {
  if (c.dead_at) return "morto";
  if (c.dying_since && hp <= 0)
    return c.stabilized_at ? "stabilizzato" : "morente";
  return hp < maxHp ? "ferito" : "illeso";
}

export const HP_STATE_LABEL: Record<HpState, string> = {
  illeso: "Illeso",
  ferito: "Ferito",
  morente: "Morente",
  stabilizzato: "Incosciente (stabilizzato)",
  morto: "Morto",
};
