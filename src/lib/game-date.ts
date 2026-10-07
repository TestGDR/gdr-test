// Calendario di gioco: giorni e lune come il calendario reale (gennaio =
// Prima Luna), 1 giorno reale = 1 giorno ON. L'anno di gioco e' l'anno
// reale + uno scostamento (tabella game_clock, Gestione -> Data di gioco).

export const MOONS = [
  "Prima Luna",
  "Seconda Luna",
  "Terza Luna",
  "Quarta Luna",
  "Quinta Luna",
  "Sesta Luna",
  "Settima Luna",
  "Ottava Luna",
  "Nona Luna",
  "Decima Luna",
  "Undicesima Luna",
  "Dodicesima Luna",
] as const;

// giorni di ogni luna (febbraio con il 29, per chi e' nato quel giorno)
export const MOON_DAYS = [
  31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
] as const;

export type GameDay = { day: number; month: number; year: number };

// Scostamento iniziale: 2026 reale = 363 D.C.
export const DEFAULT_YEAR_OFFSET = -1663;

export const moonName = (month: number) => MOONS[month - 1] ?? "?";

export function formatGameDate(d: GameDay) {
  return `G. ${d.day} - ${moonName(d.month)} - ${d.year} D.C.`;
}

export function formatBirth(day: number, month: number, year?: number | null) {
  return `${day} ${moonName(month)}${year ? ` ${year} D.C.` : ""}`;
}

// Anno di gioco di oggi senza leggere il database (scostamento iniziale):
// serve alle date degli alberi genealogici
export function gameYearNow() {
  const real = Number(
    new Date()
      .toLocaleDateString("en-CA", { timeZone: "Europe/Rome" })
      .slice(0, 4),
  );
  return real + DEFAULT_YEAR_OFFSET;
}

export const validBirth = (day?: number, month?: number) =>
  !!day &&
  !!month &&
  month >= 1 &&
  month <= 12 &&
  day >= 1 &&
  day <= MOON_DAYS[month - 1];
