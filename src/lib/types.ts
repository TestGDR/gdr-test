export type Character = {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  avatar_url: string | null;
  created_at: string;
};

export type GameMap = {
  id: string;
  name: string;
  description: string;
  image_url: string;
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

export type Room = {
  id: string;
  location_id: string;
  name: string;
  description: string;
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
