// Stesse regole del vincolo characters_name_format nel database
const LETTER = "A-Za-zÀ-ÖØ-öø-ÿ";
const NAME_RE = new RegExp(`^[${LETTER}][${LETTER}' -]*[${LETTER}]$`);

export function normalizeCharacterName(raw: string) {
  return raw.trim().replace(/\s+/g, " ");
}

// Restituisce un messaggio d'errore, oppure null se il nome e' valido
export function validateCharacterName(name: string): string | null {
  if (name.length < 2 || name.length > 40) return "Il nome deve avere tra 2 e 40 caratteri.";
  if (!NAME_RE.test(name)) {
    return "Il nome può contenere solo lettere, spazi, apostrofi e trattini.";
  }
  return null;
}
