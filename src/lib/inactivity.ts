// Regolamento sull'inattivita': per ogni personaggio dice se e' in regola,
// in scadenza, da desimbolare (nessuna giocata da una settimana) o da cancellare.
// Conta solo l'ultima azione in chat: i login non sono attivita' di gioco.

export type Level = "assente" | "ok" | "nuovo" | "attenzione" | "desimbolo" | "cancellare";

export type Verdict = {
  level: Level;
  label: string;
  detail: string;
  deadline: Date | null; // prossima scadenza (cancellazione o giocata settimanale)
};

export type ActivityInput = {
  status: string; // "bozza" = in approvazione, "attivo" = approvato
  created_at: string | null;
  activated_at: string | null;
  last_chat_action: string | null;
  absences: { from_date: string; to_date: string }[];
};

const DAY = 86_400_000;
export const GRACE_DAYS = 7; // iter, primo gioco, rientro dopo l'assenza
export const WEEK_DAYS = 7; // almeno una giocata a settimana
export const WARN_DAYS = 2; // "in scadenza" negli ultimi 2 giorni

// ordine per mostrare prima chi ha problemi
export const LEVEL_ORDER: Level[] = ["cancellare", "desimbolo", "attenzione", "nuovo", "assente", "ok"];

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const addMonth = (d: Date) => {
  const r = new Date(d);
  r.setMonth(r.getMonth() + 1);
  return r;
};
const later = (a: Date, b: Date | null) => (b && b > a ? b : a);
const short = (d: Date) =>
  d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit" });
const daysSince = (d: Date, now: Date) => Math.floor((now.getTime() - d.getTime()) / DAY);

// le assenze valgono fino a fine giornata
const dayStart = (iso: string) => new Date(`${iso}T00:00:00`);
const dayEnd = (iso: string) => new Date(`${iso}T23:59:59`);

export function judge(c: ActivityInput, now = new Date()): Verdict {
  // Assenza in corso: i termini sono sospesi
  const current = c.absences.find((a) => dayStart(a.from_date) <= now && now <= dayEnd(a.to_date));
  if (current)
    return {
      level: "assente",
      label: "In assenza",
      detail: `fino al ${short(dayEnd(current.to_date))}`,
      deadline: addDays(dayEnd(current.to_date), GRACE_DAYS),
    };
  // Assenza finita: 7 giorni per tornare in gioco o rinnovarla
  const ended = c.absences
    .filter((a) => dayEnd(a.to_date) < now)
    .map((a) => dayEnd(a.to_date))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const graceAfterAbsence = ended ? addDays(ended, GRACE_DAYS) : null;
  const absenceNote = (deadline: Date) =>
    graceAfterAbsence && deadline.getTime() === graceAfterAbsence.getTime()
      ? ` (assenza finita il ${short(ended!)})`
      : "";

  // In approvazione: 7 giorni per completare l'iter
  if (c.status !== "attivo") {
    const start = new Date(c.created_at ?? now);
    const deadline = later(addDays(start, GRACE_DAYS), graceAfterAbsence);
    if (now > deadline)
      return { level: "cancellare", label: "Da cancellare", detail: `iter non completato da ${daysSince(start, now)} giorni`, deadline };
    return { level: "nuovo", label: "In approvazione", detail: `iter da completare entro il ${short(deadline)}${absenceNote(deadline)}`, deadline };
  }

  const approved = new Date(c.activated_at ?? c.created_at ?? now);
  const last = c.last_chat_action ? new Date(c.last_chat_action) : null;

  // Approvato ma non ancora giocante: 7 giorni dall'approvazione
  if (!last || last < approved) {
    const deadline = later(addDays(approved, GRACE_DAYS), graceAfterAbsence);
    if (now > deadline)
      return { level: "cancellare", label: "Da cancellare", detail: `approvato ${daysSince(approved, now)} giorni fa, mai giocato`, deadline };
    return { level: "nuovo", label: "Non ha ancora giocato", detail: `deve iniziare entro il ${short(deadline)}${absenceNote(deadline)}`, deadline };
  }

  // Giocante: un mese dall'ultima azione (cancellazione), una giocata a settimana (desimbolo)
  const idle = daysSince(last, now);
  const month = later(addMonth(last), graceAfterAbsence);
  if (now > month)
    return { level: "cancellare", label: "Da cancellare", detail: `nessuna azione da ${idle} giorni`, deadline: month };
  const week = later(addDays(last, WEEK_DAYS), graceAfterAbsence);
  if (now > week)
    return { level: "desimbolo", label: "Da desimbolare", detail: `nessuna giocata da ${idle} giorni`, deadline: week };
  if (week.getTime() - now.getTime() <= WARN_DAYS * DAY)
    return { level: "attenzione", label: "In scadenza", detail: `giocata settimanale entro il ${short(week)}${absenceNote(week)}`, deadline: week };
  return { level: "ok", label: "In regola", detail: `ultima giocata ${idle === 0 ? "oggi" : idle === 1 ? "ieri" : `${idle} giorni fa`}`, deadline: week };
}
