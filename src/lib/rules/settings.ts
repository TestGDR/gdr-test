// Regole di salute, fatica e peso che lo staff puo' cambiare da
// Gestione -> Salute, ferite e peso. I valori di base vengono dal
// regolamento (combat-config); quelli salvati li sostituiscono.
// Sono regole uguali per tutti: si tengono in memoria e i calcoli le
// leggono con getSettings().
import { COMBAT, type WoundSeverity } from "./combat-config.ts";

export type CriticalSetting = {
  id: WoundSeverity;
  label: string;
  min: number; // margine da cui scatta (fino al margine della ferita dopo)
  bonus: number; // danno in piu'
  penalty: number; // malus alle prove (0 o negativo)
  bleed: number; // PF persi a round
};

export type LoadTier = { over: number; penalty: number; label: string };

export type GameSettings = {
  staminaRestMinutes: number; // ogni quanti minuti di riposo torna un Recupero di Stamina
  staminaZeroPenalty: number; // malus ai tiri di combattimento con la Stamina a 0
  woundHealDays: number; // ogni quanti giorni il malus di una ferita migliora di 1
  criticals: CriticalSetting[];
  woundSkills: {
    arm: string[]; // abilita' ostacolate da una ferita al braccio
    leg: string[];
    headStats: string[]; // statistiche ostacolate da una ferita alla testa
    torsoStats: string[];
  };
  load: LoadTier[]; // oltre "over" volte il carico -> malus
  loadStats: string[]; // statistiche rallentate dal peso
};

export const DEFAULT_SETTINGS: GameSettings = {
  staminaRestMinutes: COMBAT.staminaRestMinutes,
  staminaZeroPenalty: COMBAT.staminaZeroPenalty,
  woundHealDays: COMBAT.woundHealDays,
  criticals: COMBAT.criticals.map((c) => ({
    id: c.id,
    label: c.label,
    min: c.min,
    bonus: c.bonus,
    penalty: c.penalty,
    bleed: c.bleed,
  })),
  woundSkills: {
    arm: [...COMBAT.woundSkills.arm],
    leg: [...COMBAT.woundSkills.leg],
    headStats: [...COMBAT.woundSkills.headStats],
    torsoStats: [...COMBAT.woundSkills.torsoStats],
  },
  load: COMBAT.load.map((t) => ({ ...t })),
  loadStats: [...COMBAT.loadStats],
};

const int = (v: unknown, fallback: number, min: number, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const num = (v: unknown, fallback: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const strings = (v: unknown, fallback: string[]) =>
  Array.isArray(v)
    ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 80))].slice(0, 100)
    : fallback;

// Rende sicuro quello che arriva dal database (o dal pannello): valori
// mancanti o fuori scala tornano a quelli del regolamento
export function normalizeSettings(raw: unknown): GameSettings {
  const d = DEFAULT_SETTINGS;
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawCrit = Array.isArray(r.criticals) ? (r.criticals as Record<string, unknown>[]) : [];
  const criticals = d.criticals.map((base) => {
    const c = rawCrit.find((x) => x?.id === base.id) ?? {};
    return {
      id: base.id,
      label: typeof c.label === "string" && c.label.trim() ? c.label.trim().slice(0, 30) : base.label,
      min: int(c.min, base.min, 1, 99),
      bonus: int(c.bonus, base.bonus, 0, 99),
      penalty: int(c.penalty, base.penalty, -10, 0),
      bleed: int(c.bleed, base.bleed, 0, 20),
    };
  });
  const ws = (r.woundSkills && typeof r.woundSkills === "object" ? r.woundSkills : {}) as Record<string, unknown>;
  const rawLoad = Array.isArray(r.load) ? (r.load as Record<string, unknown>[]) : null;
  const load = (rawLoad ?? d.load)
    .map((t, i) => ({
      over: num(t.over, d.load[i]?.over ?? 1, 0.1, 20),
      penalty: int(t.penalty, d.load[i]?.penalty ?? -2, -20, 0),
      label: typeof t.label === "string" && t.label.trim() ? t.label.trim().slice(0, 40) : (d.load[i]?.label ?? "Appesantito"),
    }))
    .slice(0, 6)
    .sort((a, b) => a.over - b.over);
  return {
    staminaRestMinutes: int(r.staminaRestMinutes, d.staminaRestMinutes, 1, 100000),
    staminaZeroPenalty: int(r.staminaZeroPenalty, d.staminaZeroPenalty, -20, 0),
    woundHealDays: num(r.woundHealDays, d.woundHealDays, 0.1, 365),
    criticals,
    woundSkills: {
      arm: strings(ws.arm, d.woundSkills.arm),
      leg: strings(ws.leg, d.woundSkills.leg),
      headStats: strings(ws.headStats, d.woundSkills.headStats),
      torsoStats: strings(ws.torsoStats, d.woundSkills.torsoStats),
    },
    load,
    loadStats: strings(r.loadStats, d.loadStats),
  };
}

let active: GameSettings = DEFAULT_SETTINGS;
export const getSettings = () => active;
export function setSettings(s: GameSettings) {
  active = s;
}

// Legge le regole salvate e le rende attive (server e pagine)
export async function applyGameSettings(client: {
  from: (table: string) => {
    select: (cols: string) => { maybeSingle: () => PromiseLike<{ data: unknown }> };
  };
}): Promise<GameSettings> {
  const { data } = await client.from("game_settings").select("data").maybeSingle();
  const s = normalizeSettings((data as { data?: unknown } | null)?.data);
  setSettings(s);
  return s;
}
