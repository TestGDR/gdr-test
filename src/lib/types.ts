import type { CreationData } from "@/lib/character-creation";

export type Character = {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  avatar_url: string | null;
  face_claim?: string | null; // prestavolto
  created_at: string;
  status: "bozza" | "attivo";
  creation_step: number;
  creation_data: CreationData;
  sex: string | null;
  age: number | null;
  region: string | null;
  social_class: string | null;
  attributes: Record<string, number> | null;
  appearance: string | null;
  activated_at: string | null;
  house_id?: string | null;
  house_role_id?: string | null;
  // presenti solo quando la query li richiede
  house?: { name: string; sigil_url: string | null } | null;
  house_role?: { name: string } | null;
};

export type GameMap = {
  id: string;
  name: string;
  description: string;
  image_url: string;
  sort_order: number;
  active: boolean; // i giocatori vedono solo le mappe attive
  weather_region_id: string | null; // regione climatica (meteo)
  safe: boolean; // territorio sicuro: corvi e staffette non vengono intercettati
};

export type Location = {
  id: string;
  map_id: string;
  name: string;
  description: string;
  image_url: string | null;
  x: number;
  y: number;
  has_ravens: boolean; // castello o citta': partono e arrivano i corvi
  in_game: boolean; // luogo di gioco (no per es. "Chat OFF"): conta per la posizione dei PG
};

export type RoomAccess = "pubblica" | "casata" | "affitto";

export type Room = {
  id: string;
  location_id: string;
  name: string;
  description: string;
  sort_order: number;
  image_url: string | null;
  access: RoomAccess;
  house_id: string | null; // chat della casata
  price_per_hour: number; // chat in affitto
  max_hours: number;
  group_id: string | null; // gruppo dentro la macroarea (facoltativo)
};

// Contenitore di chat dentro una macroarea (es. "Fortezza Rossa")
export type RoomGroup = {
  id: string;
  location_id: string;
  name: string;
  sort_order: number;
};

export type MessageKind = "azione" | "fuori_gioco" | "master";

export type Message = {
  id: number;
  room_id: string;
  character_id: string;
  author_id: string;
  character_name: string;
  kind: MessageKind;
  content: string;
  created_at: string;
};
