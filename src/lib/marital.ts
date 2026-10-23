// Stato civile del PG (colonna characters.marital_status)
export const MARITAL_STATUSES = [
  "libero",
  "fidanzato",
  "sposato",
  "divorziato",
  "vedovo",
] as const;

// Etichetta secondo il sesso: celibe/nubile, sposato/sposata...
export function maritalLabel(
  status: string | null | undefined,
  sex: string | null,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  short = false, // nella scheda: etichetta breve (oggi uguale)
) {
  const f = sex === "donna";
  switch (status) {
    case "libero":
      return f ? "Nubile" : "Celibe";
    case "fidanzato":
      return f ? "Promessa" : "Promesso";
    case "sposato":
      return f ? "Sposata" : "Sposato";
    case "divorziato":
      return f ? "Divorziata" : "Divorziato";
    case "vedovo":
      return f ? "Vedova" : "Vedovo";
    default:
      return "—";
  }
}

// Lunghezza massima dei "Segni visibili" (pagina Dati)
export const VISIBLE_MARKS_MAX = 300;
