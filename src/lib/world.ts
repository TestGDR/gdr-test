import type { RoomAccess } from "@/lib/types";

export const ROOM_ACCESS: { id: RoomAccess; label: string; hint: string }[] = [
  { id: "pubblica", label: "Pubblica", hint: "Tutti possono entrare." },
  { id: "casata", label: "Privata · Casata", hint: "Solo i membri della casata e chi invitano." },
  { id: "affitto", label: "Privata · A pagamento", hint: "Si affitta a ore da Utility → Prenota stanza." },
];

export const WORLD_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const MAP_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const ROOM_IMAGE_MAX_BYTES = 1024 * 1024;

// Affitto in corso con il nome dell'inquilino
export type ActiveRental = {
  room_id: string;
  ends_at: string;
  character_id: string;
  character: { name: string; owner_id: string } | null;
};

// "fino alle 18:30" oppure "fino al 3/10 alle 18:30" se non e' oggi
export function untilLabel(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString()
    ? `fino alle ${time}`
    : `fino al ${d.getDate()}/${d.getMonth() + 1} alle ${time}`;
}
