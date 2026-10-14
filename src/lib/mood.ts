// Umore del popolo di una casata. Punteggio da 0 a 100 per ogni risorsa con
// un minimo "da granaio": 50 = scorte esattamente al minimo (stabile), sotto
// cala verso 0, sopra sale fino a 100. Punteggio, livello e colore li calcola
// il database (public.house_mood) con i livelli decisi in Gestione -> Economia.

export type MoodRow = {
  resource_id: string;
  have: number;
  need: number;
  score: number; // 0-100
  label: string | null; // nome del livello (null: nessun livello copre questo punteggio)
  color: string | null;
  alert: boolean | null;
};

export type MoodLevel = { id: string; from_score: number; label: string; color: string; alert: boolean };

// Come sta la casata: conta la risorsa che sta peggio
export function worstMood(rows: MoodRow[]): MoodRow | null {
  return rows.length ? rows.reduce((a, b) => (b.score < a.score ? b : a)) : null;
}
