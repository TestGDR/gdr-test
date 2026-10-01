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
  birth_year: number | null; // per i membri collegati a un PNG valgono quelli del PNG
  death_year: number | null;
  pos_x: number | null; // posizione salvata se la carta e' stata trascinata
  pos_y: number | null;
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
  house_role_id: string | null; // ruolo di casata ricoperto (occupa un posto)
  description: string;
  image_url: string | null;
  deceased: boolean;
  birth_year: number | null;
  death_year: number | null;
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

// ---------------------------------------------------------------------
// Nascita, morte ed eta' (anni Dopo la Conquista, da 0 a 999)
// ---------------------------------------------------------------------
export type LifeDates = { birth_year: number | null; death_year: number | null; deceased: boolean };

export const YEAR_MIN = 0;
export const YEAR_MAX = 999;

export function formatYear(year: number) {
  return `${year} D.C.`;
}

// Es. "312 – 350 D.C. · 38 anni", "n. 312 D.C. · 51 anni", "m. 350 D.C."
export function lifeLabel({ birth_year, death_year, deceased }: LifeDates, currentYear: number): string | null {
  const years = (n: number) => `${n} ann${n === 1 ? "o" : "i"}`;
  if (birth_year !== null && death_year !== null) {
    return `${birth_year} – ${formatYear(death_year)} · ${years(death_year - birth_year)}`;
  }
  if (birth_year !== null) {
    if (deceased) return `n. ${formatYear(birth_year)}`;
    return birth_year <= currentYear ? `n. ${formatYear(birth_year)} · ${years(currentYear - birth_year)}` : `n. ${formatYear(birth_year)}`;
  }
  if (death_year !== null) return `m. ${formatYear(death_year)}`;
  return null;
}

// Controllo degli anni inseriti: messaggio d'errore oppure null
export function validateLife({ birth_year, death_year, deceased }: LifeDates): string | null {
  for (const y of [birth_year, death_year]) {
    if (y !== null && (!Number.isInteger(y) || y < YEAR_MIN || y > YEAR_MAX)) {
      return `Gli anni devono essere numeri tra ${YEAR_MIN} e ${YEAR_MAX}.`;
    }
  }
  if (death_year !== null && !deceased) return "L'anno di morte si indica solo per chi è deceduto.";
  if (birth_year !== null && death_year !== null && death_year < birth_year) {
    return "L'anno di morte non può essere precedente a quello di nascita.";
  }
  return null;
}
