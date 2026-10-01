// Disponibilita' scelta dal giocatore cliccando il proprio pallino.
// File condiviso: lo usano sia il server (lettura del cookie) sia il browser.
export type Availability = "disponibile" | "cerca" | "occupato";

export const AVAILABILITY: Record<Availability, { label: string; dot: string }> = {
  disponibile: { label: "Disponibile", dot: "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.8)]" },
  cerca: { label: "In cerca di gioco", dot: "bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.9)]" },
  occupato: { label: "Occupato", dot: "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]" },
};

export const AVAILABILITY_COOKIE = "gdr_disponibilita";

export function isAvailability(value: unknown): value is Availability {
  return value === "disponibile" || value === "cerca" || value === "occupato";
}
