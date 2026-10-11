// Draghi: tipi, etichette e calcoli condivisi tra pannello di gestione e schede

export type DragonStage = {
  stage: string;
  label: string;
  sort_order: number;
  px_to_next: number | null; // null = ultima fase
  monthly_upkeep: number;
  stat_points: number; // punti caratteristiche alla generazione
  skill_points: number; // punti abilita' alla generazione
  stat_cap: number; // tetto di ogni caratteristica in questa fase
};

export type TraitPair = { pregio: string; difetto: string };

export type Dragon = {
  id: string;
  house_id: string | null;
  status: "uovo" | "drago";
  name: string;
  stage: string | null;
  sex: "maschio" | "femmina" | null;
  color1: string | null;
  color2: string | null;
  pregi: string[];
  difetti: string[];
  temperament: string;
  stats: Record<string, number>;
  skills: Record<string, number>;
  unspent_points: number;
  image_url: string | null;
  rider_id: string | null; // cavaliere PG
  npc_rider_id: string | null; // oppure cavaliere PNG
  growth_px: number; // PX investiti nella fase attuale (maturazione)
  loyalty: number; // fedelta' al cavaliere, 0-100: la alza il cavaliere ("Rafforza il legame") e pesa sui tiri
  hatched_at: string | null;
  created_at: string;
};

export const STATS = [
  { key: "vigore", label: "Vigore" },
  { key: "destrezza", label: "Destrezza" },
  { key: "intelletto", label: "Intelletto" },
  { key: "percezione", label: "Percezione" },
] as const;

export const MAX_VALUE = 10; // tetto di caratteristiche e abilita' (lo impone anche il database)

// Colori delle scaglie, con una tinta per i pallini
export const DRAGON_COLORS: { name: string; hex: string }[] = [
  { name: "Oro", hex: "#d4a72c" },
  { name: "Bianco", hex: "#ece8df" },
  { name: "Blu", hex: "#2f5fa8" },
  { name: "Nero", hex: "#151515" },
  { name: "Rosso", hex: "#a3201b" },
  { name: "Bronzo", hex: "#9a6b34" },
  { name: "Verde", hex: "#2f6b3a" },
  { name: "Arancio", hex: "#d9682a" },
];
export const colorHex = (name: string | null) => DRAGON_COLORS.find((c) => c.name === name)?.hex ?? "#555";

export function colorLabel(d: Pick<Dragon, "color1" | "color2">) {
  if (!d.color1) return "—";
  return d.color2 ? `${d.color1} e ${d.color2}` : d.color1;
}

export function dragonName(d: Pick<Dragon, "name" | "status">) {
  return d.name.trim() || (d.status === "uovo" ? "Uovo di drago" : "Drago senza nome");
}

// Mantenimento mensile (risorse della casata): base della fase, ritoccata da
// "poco affamato" (-25%) e "molto affamato" (+50%)
export function monthlyUpkeep(d: Pick<Dragon, "status" | "stage" | "pregi" | "difetti">, stages: DragonStage[]) {
  if (d.status !== "drago") return 0;
  let cost = stages.find((s) => s.stage === d.stage)?.monthly_upkeep ?? 0;
  if (d.pregi.includes("poco affamato")) cost *= 0.75;
  if (d.difetti.includes("molto affamato")) cost *= 1.5;
  return Math.round(cost);
}

export function stageLabel(stage: string | null, stages: DragonStage[]) {
  return stages.find((s) => s.stage === stage)?.label ?? "—";
}

export function nextStage(stage: string | null, stages: DragonStage[]) {
  const cur = stages.find((s) => s.stage === stage);
  return cur ? (stages.find((s) => s.sort_order === cur.sort_order + 1) ?? null) : null;
}

// ---------------------------------------------------------------------
// Effetti di pregi e difetti: modificatori su caratteristiche e abilita'
// (i valori del drago non cambiano: i modificatori si sommano nei tiri)
// ---------------------------------------------------------------------
export type TraitEffect = {
  id: number;
  side: "pregio" | "difetto";
  trait: string;
  target_kind: "caratteristica" | "abilita";
  target_key: string;
  modifier: number;
  condition: string;
};

export type Modifier = { total: number; sources: TraitEffect[] };

// Modificatori del drago, per "caratteristica:vigore" / "abilita:volare"
export function dragonModifiers(d: Pick<Dragon, "pregi" | "difetti">, effects: TraitEffect[]) {
  const out: Record<string, Modifier> = {};
  for (const e of effects) {
    const has = e.side === "pregio" ? d.pregi.includes(e.trait) : d.difetti.includes(e.trait);
    if (!has) continue;
    const key = `${e.target_kind}:${e.target_key}`;
    out[key] ??= { total: 0, sources: [] };
    // con una condizione il modificatore vale solo in certi tiri: non entra nel totale fisso
    if (!e.condition.trim()) out[key].total += e.modifier;
    out[key].sources.push(e);
  }
  return out;
}

export const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

// "+1 Volare (solo di notte)"
export function effectLabel(e: TraitEffect, skillLabel: (key: string) => string) {
  const target = e.target_kind === "caratteristica" ? (STATS.find((s) => s.key === e.target_key)?.label ?? e.target_key) : skillLabel(e.target_key);
  return `${signed(e.modifier)} ${target}${e.condition.trim() ? ` (${e.condition.trim()})` : ""}`;
}

// ---------------------------------------------------------------------
// Fedelta' al cavaliere (0-100). Parte da 0, la alza solo il cavaliere
// spendendo PX ("Rafforza il legame") e torna a 0 quando il drago cambia o
// perde il cavaliere. A ogni tiro del drago:
//   - "chance" % di avere il modificatore "mod" (bonus o malus)
//   - "critSuccess" % di successo critico (+1d10)
//   - "critFail" % di fallimento critico (-1d10)
// Piu' il drago e' grande, piu' fedelta' serve perche' ascolti: sotto la
// soglia del suo stadio disobbedisce e i fallimenti critici aumentano.
// ---------------------------------------------------------------------
export type LoyaltyTier = {
  from: number; // fedelta' minima
  name: string;
  chance: number;
  mod: number;
  critSuccess: number;
  critFail: number;
};

export const LOYALTY_TIERS: LoyaltyTier[] = [
  { from: 0, name: "Diffidente", chance: 20, mod: -2, critSuccess: 0, critFail: 15 },
  { from: 25, name: "Guardingo", chance: 10, mod: -1, critSuccess: 5, critFail: 10 },
  { from: 50, name: "Legato", chance: 15, mod: 1, critSuccess: 5, critFail: 5 },
  { from: 75, name: "Devoto", chance: 25, mod: 2, critSuccess: 10, critFail: 3 },
  { from: 100, name: "Un'anima sola", chance: 35, mod: 2, critSuccess: 15, critFail: 0 },
];

// Soglia di obbedienza: 20% in piu' a ogni stadio (neonato 0, adulto 80)
export const OBEDIENCE_STEP = 20;
export const obedienceThreshold = (stageIndex: number) => Math.min(100, Math.max(0, stageIndex) * OBEDIENCE_STEP);
export const stageIndex = (stage: string | null, stages: DragonStage[]) => stages.find((s) => s.stage === stage)?.sort_order ?? 0;

// Fascia di fedelta' con gli effetti in vigore per un drago di quello stadio
export function loyaltyTier(loyalty: number, stageIdx = 0): LoyaltyTier & { threshold: number; disobeys: boolean } {
  const tier = [...LOYALTY_TIERS].reverse().find((t) => loyalty >= t.from) ?? LOYALTY_TIERS[0];
  const threshold = obedienceThreshold(stageIdx);
  const disobeys = loyalty < threshold;
  // sotto la soglia: mezzo punto percentuale di fallimento critico per ogni punto che manca
  const critFail = disobeys ? Math.max(tier.critFail, Math.round((threshold - loyalty) / 2)) : tier.critFail;
  return { ...tier, critFail, threshold, disobeys };
}

// "25% di +2 al tiro · successo critico 10% · fallimento critico 3%"
export function loyaltyEffects(t: LoyaltyTier) {
  return [
    `${t.chance}% di ${signed(t.mod)} al tiro`,
    `successo critico ${t.critSuccess}%`,
    `fallimento critico ${t.critFail}%`,
  ].join(" · ");
}

// Effetto della fedelta' su un tiro del drago: quanto aggiunge (o toglie) e perche'
export function rollLoyalty(loyalty: number, stageIdx: number, rng: () => number): { value: number; label: string } {
  const t = loyaltyTier(loyalty, stageIdx);
  const d100 = () => Math.floor(rng() * 100) + 1;
  let value = 0;
  const notes: string[] = [];
  if (d100() <= t.chance) {
    value += t.mod;
    notes.push(t.mod > 0 ? "slancio" : "riluttanza");
  }
  const crit = d100();
  if (crit <= t.critFail) {
    value -= Math.floor(rng() * 10) + 1;
    notes.push(t.disobeys ? "non ascolta: fallimento critico" : "fallimento critico");
  } else if (crit > 100 - t.critSuccess) {
    value += Math.floor(rng() * 10) + 1;
    notes.push("successo critico");
  }
  return { value, label: `fedeltà (${notes.join(", ")})` };
}
