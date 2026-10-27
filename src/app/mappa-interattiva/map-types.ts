// Tipi della mappa interattiva (coordinate in pixel dell'immagine: [y, x])
export type Point = [number, number];

export type MapSettings = { image_url: string | null; width: number; height: number };

export type FeatureKind = "confine" | "strada" | "luogo";

export type MapFeature = {
  id: string;
  kind: FeatureKind;
  name: string;
  description: string;
  color: string;
  place_type: PlaceType | RouteType | null; // tipo di luogo (luoghi) o di percorso (linee)
  house_id: string | null;
  geometry: Point | Point[];
};

export type PlaceType =
  | "capitale"
  | "castello"
  | "fortezza"
  | "citta"
  | "villaggio"
  | "porto"
  | "tempio"
  | "rovine"
  | "interesse"
  | "altro";

export const PLACE_TYPES: { id: PlaceType; label: string; letter: string }[] = [
  { id: "capitale", label: "Capitale", letter: "" },
  { id: "castello", label: "Castello", letter: "" },
  { id: "fortezza", label: "Fortezza", letter: "" },
  { id: "citta", label: "Città", letter: "C" },
  { id: "villaggio", label: "Villaggio", letter: "V" },
  { id: "porto", label: "Porto", letter: "P" },
  { id: "tempio", label: "Tempio / Sept", letter: "T" },
  { id: "rovine", label: "Rovine", letter: "R" },
  { id: "interesse", label: "Luogo d'interesse", letter: "" },
  { id: "altro", label: "Altro", letter: "•" },
];

// tipi che compaiono nella vista "Castelli"
export const CASTLE_TYPES: string[] = ["capitale", "castello", "fortezza"];

// Percorsi (le linee): aspetto della linea
export type RouteType = "strada" | "sentiero" | "rotta";
export const ROUTE_TYPES: { id: RouteType; label: string; weight: number; dash?: string }[] = [
  { id: "strada", label: "Strada", weight: 4 },
  { id: "sentiero", label: "Sentiero", weight: 2, dash: "2 6" },
  { id: "rotta", label: "Rotta marittima", weight: 3, dash: "10 8" },
];

export const KIND_LABEL: Record<FeatureKind, string> = {
  confine: "Confine",
  strada: "Percorso",
  luogo: "Luogo",
};

export type House = { id: string; name: string; sigil_url: string | null };
