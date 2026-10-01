// Tipi delle casate, condivisi tra pagine, pannello e azioni
export type House = {
  id: string;
  name: string; // = cognome dei membri
  description: string;
  sigil_url: string | null;
  sort_order: number;
};

export type HouseRole = {
  id: string;
  house_id: string;
  name: string;
  daily_salary: number;
  sort_order: number;
  // disponibilita' all'iscrizione (creazione del PG)
  signup_available: boolean;
  max_members: number | null;
  required_sex: "uomo" | "donna" | null; // null = qualsiasi
  min_age: number | null;
  max_age: number | null;
};

// Una riga di signup_house_roles(): ruolo che un PG puo' scegliere all'iscrizione
export type SignupRole = {
  house_id: string;
  house_name: string;
  sigil_url: string | null;
  role_id: string;
  role_name: string;
  daily_salary: number;
  free_slots: number;
};

export type FamilyMember = {
  id: string;
  house_id: string;
  parent_id: string | null;
  parent2_id: string | null; // secondo genitore (figlio di una coppia)
  npc_id: string | null; // PNG collegato (anche di un'altra casata)
  name: string;
  spouse: string;
  note: string;
  deceased: boolean;
  sort_order: number;
};

export type RelationKind = "matrimonio" | "promessi" | "amanti" | "separati";

export const RELATION_KINDS: Record<RelationKind, { label: string; symbol: string }> = {
  matrimonio: { label: "Sposati", symbol: "⚭" },
  promessi: { label: "Promessi sposi", symbol: "💍" },
  amanti: { label: "Amanti", symbol: "♥" },
  separati: { label: "Separati", symbol: "⚮" },
};

export type FamilyRelation = {
  id: string;
  house_id: string;
  member_a: string;
  member_b: string;
  kind: RelationKind;
  note: string;
};

export type HouseNpc = {
  id: string;
  house_id: string;
  name: string;
  title: string;
  description: string;
  image_url: string | null;
  sort_order: number;
};

export type HouseMember = {
  id: string;
  name: string;
  status: "bozza" | "attivo";
  house_id: string;
  house_role_id: string | null;
};

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const IMAGE_MAX_BYTES = 1024 * 1024;
