// Condizione fisica del personaggio fuori e dentro il combattimento:
// - ferite che guariscono da sole col tempo (la penalita' cala man mano)
// - peso trasportato rispetto al carico (BODY x 10 kg)
// - penalita' delle ferite sulle prove, in base alla parte del corpo
// Modulo puro: l'ora si passa come parametro.
import { getSettings } from "./settings.ts";
import { DAY_MS } from "./hp.ts";

export type WoundRow = {
  location: string;
  severity: string;
  bleed: number;
  penalty: number; // negativa, com'era al momento della ferita
  mutilated?: boolean | null;
  created_at?: string | null;
};

// Penalita' di oggi: ogni "woundHealDays" giorni migliora di 1. Non guarisce
// finche' sanguina, e una mutilazione non guarisce mai da sola.
export function woundPenaltyNow(w: WoundRow, now: number): number {
  if (w.penalty >= 0) return 0;
  if (w.bleed > 0 || w.mutilated || !w.created_at) return w.penalty;
  const days = Math.max(0, (now - Date.parse(w.created_at)) / DAY_MS);
  return Math.min(0, w.penalty + Math.floor(days / getSettings().woundHealDays));
}

// Giorni che mancano alla guarigione completa (null = non guarisce da sola)
export function woundDaysLeft(w: WoundRow, now: number): number | null {
  if (w.penalty >= 0 || w.bleed > 0 || w.mutilated || !w.created_at)
    return null;
  const total = -w.penalty * getSettings().woundHealDays * DAY_MS;
  return Math.max(
    0,
    Math.ceil((Date.parse(w.created_at) + total - now) / DAY_MS),
  );
}

// Ferita critica ormai guarita: non pesa piu' e si puo' togliere
// (i semplici sanguinamenti restano finche' qualcuno non li ferma)
export function isWoundHealed(w: WoundRow, now: number): boolean {
  return w.severity !== "bleeding" && w.bleed <= 0 && woundPenaltyNow(w, now) === 0;
}

// ---------------------------------------------------------------------
// Peso trasportato
// ---------------------------------------------------------------------
export type LoadState = {
  weight: number; // kg addosso
  carry: number; // kg senza malus
  penalty: number; // 0 o negativa
  label: string; // "" se non c'e' malus
};

export function loadState(weightKg: number, carryKg: number): LoadState {
  const weight = Math.round(weightKg * 10) / 10;
  const ratio = carryKg > 0 ? weight / carryKg : weight > 0 ? Infinity : 0;
  const tier = [...getSettings().load].reverse().find((t) => ratio > t.over);
  return {
    weight,
    carry: carryKg,
    penalty: tier?.penalty ?? 0,
    label: tier?.label ?? "",
  };
}

// Il peso rallenta le prove fisiche: quelle su queste statistiche
export const loadAffects = (statId: string | null | undefined) =>
  !!statId && getSettings().loadStats.includes(statId);

// ---------------------------------------------------------------------
// Ferite sulle prove: conta la peggiore tra quelle che c'entrano
// ---------------------------------------------------------------------
const PART: Record<string, "head" | "torso" | "arm" | "leg"> = {
  head: "head",
  torso: "torso",
  arm_r: "arm",
  arm_l: "arm",
  leg_r: "leg",
  leg_l: "leg",
};
const PART_LABEL = {
  head: "ferita alla testa",
  torso: "ferita al tronco",
  arm: "ferita al braccio",
  leg: "ferita alla gamba",
} as const;

// Quali parti del corpo ostacolano questa prova
function partsFor(skillName: string | null | undefined, statId: string | null | undefined) {
  const parts = new Set<"head" | "torso" | "arm" | "leg">();
  const w = getSettings().woundSkills;
  const has = (list: readonly string[]) =>
    !!skillName && list.some((s) => s.toLowerCase() === skillName.toLowerCase());
  if (skillName) {
    if (has(w.arm)) parts.add("arm");
    if (has(w.leg)) parts.add("leg");
  } else if (statId === "ref") {
    // prova sulla sola statistica: REF usa braccia e gambe
    parts.add("arm");
    parts.add("leg");
  }
  if (statId && w.headStats.includes(statId)) parts.add("head");
  if (statId && w.torsoStats.includes(statId)) parts.add("torso");
  return parts;
}

export function woundPenaltyFor(
  wounds: WoundRow[],
  skillName: string | null | undefined,
  statId: string | null | undefined,
  now: number,
): { value: number; label: string } | null {
  const parts = partsFor(skillName, statId);
  let worst: { value: number; label: string } | null = null;
  for (const w of wounds) {
    const part = PART[w.location];
    if (!part || !parts.has(part)) continue;
    const value = woundPenaltyNow(w, now);
    if (value < 0 && (!worst || value < worst.value))
      worst = { value, label: PART_LABEL[part] };
  }
  return worst;
}
