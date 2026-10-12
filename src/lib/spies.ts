// Spie: tipi e testi condivisi tra il pannello del giocatore e la gestione

export type SpySettings = {
  trait_name: string;
  recruit_cost: number;
  train_cost: number; // x il nuovo livello
  max_level: number;
  max_spies: number;
  hours_light: number;
  hours_normal: number;
  hours_deep: number;
  fail_light: number;
  fail_normal: number;
  fail_deep: number;
  level_bonus: number;
  min_fail: number;
  killed_pct: number;
};

export type SpyStatus = "libera" | "missione" | "catturata" | "morta";
export type Spy = { id: string; character_id: string; name: string; level: number; status: SpyStatus; created_at: string };

export type Depth = "superficiale" | "normale" | "approfondita";
export const DEPTHS: { id: Depth; label: string; hint: string }[] = [
  { id: "superficiale", label: "Superficiale", hint: "Voci, impressioni, chi frequenta chi: poco rischio, poche certezze." },
  { id: "normale", label: "Normale", hint: "Fatti verificati e qualche dettaglio riservato." },
  { id: "approfondita", label: "Approfondita", hint: "Segreti ben custoditi, documenti, piani: molto più rischioso." },
];

export const STATUS_LABEL: Record<SpyStatus, string> = {
  libera: "Disponibile",
  missione: "In missione",
  catturata: "Catturata",
  morta: "Morta",
};

export const depthHours = (s: SpySettings, d: Depth) => (d === "superficiale" ? s.hours_light : d === "normale" ? s.hours_normal : s.hours_deep);
// Probabilita' di fallire: quella della ricerca, meno il bonus per ogni livello oltre il primo
export const failChance = (s: SpySettings, level: number, d: Depth) =>
  Math.max(s.min_fail, (d === "superficiale" ? s.fail_light : d === "normale" ? s.fail_normal : s.fail_deep) - s.level_bonus * Math.max(0, level - 1));
export const trainCost = (s: SpySettings, level: number) => s.train_cost * (level + 1);

// "2 ore e 30 minuti", "45 minuti", "1 giorno e 3 ore"
export function duration(minutes: number) {
  const m = Math.max(0, Math.round(minutes));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const r = m % 60;
  const parts = [
    d ? `${d} ${d === 1 ? "giorno" : "giorni"}` : "",
    h ? `${h} ${h === 1 ? "ora" : "ore"}` : "",
    r && !d ? `${r} ${r === 1 ? "minuto" : "minuti"}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" e ") : "subito";
}

export const when = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
