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
  place_type: PlaceType | null;
  house_id: string | null;
  geometry: Point | Point[];
};

export type PlaceType = "castello" | "citta" | "villaggio" | "porto" | "tempio" | "rovine" | "altro";

export const PLACE_TYPES: { id: PlaceType; label: string; letter: string }[] = [
  { id: "castello", label: "Castello", letter: "" },
  { id: "citta", label: "Città", letter: "C" },
  { id: "villaggio", label: "Villaggio", letter: "V" },
  { id: "porto", label: "Porto", letter: "P" },
  { id: "tempio", label: "Tempio / Sept", letter: "T" },
  { id: "rovine", label: "Rovine", letter: "R" },
  { id: "altro", label: "Altro", letter: "•" },
];

export const KIND_LABEL: Record<FeatureKind, string> = {
  confine: "Confine",
  strada: "Strada",
  luogo: "Luogo d'interesse",
};

export type House = { id: string; name: string; sigil_url: string | null };
