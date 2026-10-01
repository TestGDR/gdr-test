// =====================================================================
// CONFIGURAZIONE DELLA CREAZIONE DEL PERSONAGGIO
// Per cambiare regioni, ceti, caratteristiche o punti modifica solo questo file:
// lo usano sia la procedura guidata (browser) sia la validazione sul server.
// =====================================================================

export const SEXES = [
  { id: "uomo", label: "Uomo" },
  { id: "donna", label: "Donna" },
] as const;

export const AGE_MIN = 16;
export const AGE_MAX = 80;

export const REGIONS = [
  { id: "nord", label: "Il Nord" },
  { id: "isole-ferro", label: "Le Isole di Ferro" },
  { id: "terre-fiumi", label: "Le Terre dei Fiumi" },
  { id: "valle", label: "La Valle di Arryn" },
  { id: "terre-ovest", label: "Le Terre dell'Ovest" },
  { id: "terre-corona", label: "Le Terre della Corona" },
  { id: "terre-tempesta", label: "Le Terre della Tempesta" },
  { id: "altopiano", label: "L'Altopiano" },
  { id: "dorne", label: "Dorne" },
  { id: "citta-libere", label: "Le Città Libere (Essos)" },
] as const;

export const SOCIAL_CLASSES = [
  { id: "popolano", label: "Popolano", description: "Contadini, servi, braccianti: la gente comune del regno." },
  { id: "artigiano", label: "Artigiano o mercante", description: "Fabbri, locandieri, mercanti: chi vive del proprio mestiere." },
  { id: "armigero", label: "Uomo d'arme", description: "Soldati, guardie, mercenari al servizio di un signore." },
  { id: "cavaliere", label: "Cavaliere o vassallo", description: "Cavalieri unti e piccoli feudatari legati a una casata." },
  { id: "nobile", label: "Nobile minore", description: "Membro di una casata minore, con terre e un nome da difendere." },
] as const;

export const ATTRIBUTES = [
  { id: "forza", label: "Forza" },
  { id: "destrezza", label: "Destrezza" },
  { id: "costituzione", label: "Costituzione" },
  { id: "intelligenza", label: "Intelligenza" },
  { id: "percezione", label: "Percezione" },
  { id: "carisma", label: "Carisma" },
] as const;

export const ATTRIBUTE_BASE = 3; // valore di partenza di ogni caratteristica
export const ATTRIBUTE_MAX = 8; // valore massimo alla creazione
export const ATTRIBUTE_POINTS = 12; // punti da distribuire

export const APPEARANCE_MIN = 30;
export const STORY_MIN = 100;
export const TEXT_MAX = 4000;

export const STEPS = ["Identità", "Origine", "Caratteristiche", "Aspetto e storia", "Riepilogo"] as const;

export type CreationData = {
  sex?: string;
  age?: number;
  region?: string;
  social_class?: string;
  attributes?: Record<string, number>;
  appearance?: string;
  story?: string;
};

const ids = (list: readonly { id: string }[]) => list.map((x) => x.id);

export function labelOf(list: readonly { id: string; label: string }[], id?: string | null) {
  return list.find((x) => x.id === id)?.label ?? "—";
}

export function defaultAttributes(): Record<string, number> {
  return Object.fromEntries(ATTRIBUTES.map((a) => [a.id, ATTRIBUTE_BASE]));
}

export function pointsSpent(attributes: Record<string, number> = defaultAttributes()) {
  return ATTRIBUTES.reduce((sum, a) => sum + ((attributes[a.id] ?? ATTRIBUTE_BASE) - ATTRIBUTE_BASE), 0);
}

// Tiene solo campi noti e valori nel formato giusto (i dati arrivano dal browser)
export function sanitizeCreationData(raw: unknown): CreationData {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: CreationData = {};

  if (typeof input.sex === "string" && ids(SEXES).includes(input.sex)) out.sex = input.sex;
  if (Number.isInteger(input.age)) out.age = input.age as number;
  if (typeof input.region === "string" && ids(REGIONS).includes(input.region)) out.region = input.region;
  if (typeof input.social_class === "string" && ids(SOCIAL_CLASSES).includes(input.social_class)) {
    out.social_class = input.social_class;
  }
  if (input.attributes && typeof input.attributes === "object") {
    const attrs = input.attributes as Record<string, unknown>;
    out.attributes = Object.fromEntries(
      ATTRIBUTES.map((a) => {
        const v = Number(attrs[a.id]);
        return [a.id, Number.isInteger(v) ? Math.min(ATTRIBUTE_MAX, Math.max(ATTRIBUTE_BASE, v)) : ATTRIBUTE_BASE];
      }),
    );
  }
  if (typeof input.appearance === "string") out.appearance = input.appearance.slice(0, TEXT_MAX);
  if (typeof input.story === "string") out.story = input.story.slice(0, TEXT_MAX);
  return out;
}

// Errore dello step indicato, oppure null se lo step e' completo
export function validateStep(step: number, data: CreationData): string | null {
  switch (step) {
    case 0:
      if (!data.sex) return "Scegli il sesso del personaggio.";
      if (!data.age || data.age < AGE_MIN || data.age > AGE_MAX) {
        return `L'età deve essere tra ${AGE_MIN} e ${AGE_MAX} anni.`;
      }
      return null;
    case 1:
      if (!data.region) return "Scegli la regione d'origine.";
      if (!data.social_class) return "Scegli il ceto sociale.";
      return null;
    case 2: {
      const left = ATTRIBUTE_POINTS - pointsSpent(data.attributes);
      if (left > 0) return `Devi ancora distribuire ${left} punt${left === 1 ? "o" : "i"}.`;
      if (left < 0) return "Hai usato più punti di quelli disponibili.";
      return null;
    }
    case 3:
      if ((data.appearance?.trim().length ?? 0) < APPEARANCE_MIN) {
        return `Descrivi l'aspetto con almeno ${APPEARANCE_MIN} caratteri.`;
      }
      if ((data.story?.trim().length ?? 0) < STORY_MIN) {
        return `Scrivi una storia di almeno ${STORY_MIN} caratteri.`;
      }
      return null;
    default:
      return null;
  }
}

// Primo step incompleto, oppure null se tutto e' pronto per la conferma
export function firstInvalidStep(data: CreationData): number | null {
  for (let i = 0; i < STEPS.length - 1; i++) if (validateStep(i, data)) return i;
  return null;
}
