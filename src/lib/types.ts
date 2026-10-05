export type Character = {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  avatar_url: string | null; // immagine di chat 100 x 100 (barra a sinistra, OFF, elenchi)
  portrait_url?: string | null; // ritratto della scheda (pagina Dati)
  cover_url?: string | null; // immagine lunga della prima pagina della scheda (computer)
  cover_mobile_url?: string | null; // la stessa, verticale, per il cellulare
  sheet_html?: string | null; // pagina Principale scritta in HTML e CSS (ripulita al momento di mostrarla)
  sheet_unlocks?: string[]; // parti della scheda sbloccate dall'admin ("storia", "anagrafica")
  coins?: number; // monete sul conto
  fate_notes?: string | null; // Note del Fato (le scrive lo staff)
  known_html?: string | null; // "Si sa che" (editor di testo del giocatore)
  affections_html?: string | null; // "Affetti"
  face_claim?: string | null; // prestavolto
  created_at: string;
  status: "bozza" | "attivo";
  creation_step: number;
  sex: string | null;
  age: number | null;
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
  kind: "luogo" | "viaggio_terra" | "viaggio_mare"; // macroaree di viaggio: chat per chi e' in viaggio
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
