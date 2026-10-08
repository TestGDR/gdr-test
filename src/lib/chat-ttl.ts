// Le azioni restano visibili in chat per un'ora dall'invio, poi spariscono
// dalla chat (restano nel database: lo staff le ritrova in Gestione -> Log)
export const CHAT_TTL_MS = 60 * 60 * 1000;

export function isFresh(createdAt: string, now: number) {
  return now - Date.parse(createdAt) < CHAT_TTL_MS;
}

// Da quando prendere le azioni ancora visibili (per le query)
export function freshSince() {
  return new Date(Date.now() - CHAT_TTL_MS).toISOString();
}
