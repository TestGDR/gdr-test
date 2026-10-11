// Archivio giocate: tipi e file da scaricare

export type SavedMessage = {
  t: string; // quando
  name: string; // personaggio
  kind: "azione" | "master" | "dado" | "sistema";
  content: string;
  to?: string | null;
};

export type SavedGame = {
  id: string;
  room_name: string;
  place_name: string;
  started_at: string;
  ended_at: string;
  participants: string[];
  message_count: number;
  messages: SavedMessage[];
  avatars: Record<string, string>;
  note: string;
  created_at: string;
};

const TZ = "Europe/Rome";
export const gameDay = (iso: string) =>
  new Date(iso).toLocaleDateString("it-IT", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
export const gameTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("it-IT", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
export const gameTitle = (g: Pick<SavedGame, "started_at" | "room_name">) => `${gameDay(g.started_at)} - ${g.room_name}`;

// Riga di testo di un messaggio salvato
export function savedLine(m: SavedMessage) {
  const tag = m.kind === "master" ? "[MASTER] " : m.kind === "dado" ? "[DADO] " : "";
  if (m.kind === "sistema") return `[${gameTime(m.t)}] ${m.name} ${m.content}`;
  if (m.kind === "dado") return `[${gameTime(m.t)}] ${tag}${m.name} ${m.content}`;
  return `[${gameTime(m.t)}] ${tag}${m.name}${m.to ? ` → ${m.to}` : ""}:\n${m.content}\n`;
}

// File di testo della giocata
export function downloadGame(g: SavedGame) {
  const head = [
    gameTitle(g),
    g.place_name ? `Luogo: ${g.place_name}` : "",
    `Orario: ${gameTime(g.started_at)}-${gameTime(g.ended_at)}`,
    `Personaggi: ${g.participants.join(", ")}`,
    g.note ? `Nota: ${g.note}` : "",
  ].filter(Boolean);
  const blob = new Blob([`${head.join("\n")}\n\n${g.messages.map(savedLine).join("\n")}\n`], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${g.started_at.slice(0, 10)} ${g.room_name.replace(/[^\p{L}\p{N}\s-]/gu, "").trim() || "giocata"}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
