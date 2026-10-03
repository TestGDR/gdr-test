// Meteo: condizioni, stagioni e fasce della giornata (condivisi tra gestione e gioco)

export type Season = "inverno" | "primavera" | "estate" | "autunno";

export const SEASONS: { id: Season; label: string }[] = [
  { id: "inverno", label: "Inverno" },
  { id: "primavera", label: "Primavera" },
  { id: "estate", label: "Estate" },
  { id: "autunno", label: "Autunno" },
];

// Condizioni del tempo: icona di giorno e (se diversa) di notte
export const CONDITIONS: { id: string; label: string; icon: string; night?: string }[] = [
  { id: "sereno", label: "Sereno", icon: "☀️", night: "🌙" },
  { id: "poco_nuvoloso", label: "Poco nuvoloso", icon: "🌤️", night: "☁️" },
  { id: "nuvoloso", label: "Nuvoloso", icon: "☁️" },
  { id: "nebbia", label: "Nebbia", icon: "🌫️" },
  { id: "vento", label: "Vento forte", icon: "💨" },
  { id: "pioggerella", label: "Pioggerella", icon: "🌦️", night: "🌧️" },
  { id: "pioggia", label: "Pioggia", icon: "🌧️" },
  { id: "temporale", label: "Temporale", icon: "⛈️" },
  { id: "burrasca", label: "Burrasca", icon: "🌊" },
  { id: "nevischio", label: "Nevischio", icon: "🌨️" },
  { id: "neve", label: "Neve", icon: "❄️" },
  { id: "bufera", label: "Bufera di neve", icon: "🌬️" },
  { id: "afa", label: "Calura", icon: "🔥" },
  { id: "tempesta_sabbia", label: "Tempesta di sabbia", icon: "🏜️" },
];

export const condition = (id: string) => CONDITIONS.find((c) => c.id === id) ?? { id, label: id, icon: "❔" };

// Di notte (dalle 20 alle 6) alcune icone cambiano (luna invece del sole)
export function conditionIcon(id: string, hour: number) {
  const c = condition(id);
  const night = hour >= 20 || hour < 6;
  return night && "night" in c && c.night ? c.night : c.icon;
}

// Fasce della giornata: ore e nome
export const PERIODS = [
  { id: "notte", label: "Notte", from: 0, to: 5 },
  { id: "mattina", label: "Mattina", from: 6, to: 11 },
  { id: "pomeriggio", label: "Pomeriggio", from: 12, to: 17 },
  { id: "sera", label: "Sera", from: 18, to: 23 },
] as const;

export type WeatherHour = { cond: string; temp: number };
export type WeatherDay = { region_id: string; day: string; season: Season; seed_name: string; hours: WeatherHour[] };
export type WeatherRegion = {
  id: string;
  slug: string | null;
  name: string;
  description: string;
  climate: string;
  active: boolean;
  sort_order: number;
};
export type WeatherSeed = {
  id: string;
  region_id: string;
  season: Season;
  name: string;
  weight: number;
  periods: WeatherHour[]; // notte, mattina, pomeriggio, sera
  sort_order: number;
};

// Ora attuale in Italia (il meteo segue l'ora italiana)
export function romeHour() {
  return Number(new Intl.DateTimeFormat("it-IT", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Rome" }).format(new Date()));
}
