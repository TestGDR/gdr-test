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
  rider_id: string | null;
  hatched_at: string | null;
  created_at: string;
};

export const STATS = [
  { key: "vigore", label: "Vigore" },
  { key: "destrezza", label: "Destrezza" },
  { key: "intelletto", label: "Intelletto" },
  { key: "percezione", label: "Percezione" },
] as const;

export const SKILLS = [
  { key: "volare", label: "Volare" },
  { key: "attacco_fisico", label: "Attacco fisico" },
  { key: "attacco_infuocato", label: "Attacco infuocato" },
  { key: "schivare", label: "Schivare" },
  { key: "fermezza", label: "Fermezza" },
  { key: "sensi", label: "Sensi" },
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
