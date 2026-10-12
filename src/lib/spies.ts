// Spie: tipi e testi condivisi tra il pannello del giocatore e la gestione

export type SpySettings = {
  trait_name: string; // tratto che alza il numero massimo di spie
  max_spies: number; // spie di un personaggio senza il tratto
  max_spies_trait: number; // spie di un personaggio con il tratto
  hours_light: number;
  hours_normal: number;
  hours_deep: number;
  killed_pct: number; // tra i fallimenti: uccisa (il resto catturata)
};

// Un livello della spia: quanto costa arrivarci (il livello 1 = reclutarla)
// e quante probabilita' ha di riuscire in ogni tipo di ricerca
export type SpyLevel = { level: number; cost: number; ok_light: number; ok_normal: number; ok_deep: number };

// Regole complete per un personaggio: impostazioni, livelli e quante spie puo' avere
export type SpyRules = SpySettings & { levels: SpyLevel[]; limit: number };

// abbandonata: catturata, e il proprietario ha rinunciato a lei per liberare il posto
export type SpyStatus = "libera" | "missione" | "catturata" | "morta" | "abbandonata";
// le spie perse non occupano piu' un posto
export const isLost = (status: SpyStatus) => status === "morta" || status === "abbandonata";
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
  abbandonata: "Abbandonata",
};

export const depthHours = (s: SpySettings, d: Depth) => (d === "superficiale" ? s.hours_light : d === "normale" ? s.hours_normal : s.hours_deep);

const levelRow = (levels: SpyLevel[], level: number) => levels.find((l) => l.level === level) ?? null;
// Probabilita' di riuscire (%) di una spia di quel livello in quel tipo di ricerca
export function successChance(levels: SpyLevel[], level: number, d: Depth) {
  const row = levelRow(levels, level);
  if (!row) return 0;
  return d === "superficiale" ? row.ok_light : d === "normale" ? row.ok_normal : row.ok_deep;
}
export const failChance = (r: { levels: SpyLevel[] }, level: number, d: Depth) => 100 - successChance(r.levels, level, d);
export const maxLevel = (r: { levels: SpyLevel[] }) => r.levels.reduce((m, l) => Math.max(m, l.level), 1);
export const recruitCost = (r: { levels: SpyLevel[] }) => levelRow(r.levels, 1)?.cost ?? 0;
// costo per portare la spia dal suo livello a quello dopo
export const trainCost = (r: { levels: SpyLevel[] }, level: number) => levelRow(r.levels, level + 1)?.cost ?? 0;

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
