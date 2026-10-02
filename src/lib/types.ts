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
};

export type Location = {
  id: string;
  map_id: string;
  name: string;
  description: string;
  image_url: string | null;
  x: number;
  y: number;
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
