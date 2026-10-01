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
};

export type FamilyMember = {
  id: string;
  house_id: string;
  parent_id: string | null;
  name: string;
  spouse: string;
  note: string;
  deceased: boolean;
  sort_order: number;
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
