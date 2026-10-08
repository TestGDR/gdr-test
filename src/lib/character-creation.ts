import { RULES } from "@/lib/rules/config";

// =====================================================================
// DATI DELLA CREAZIONE DEL PERSONAGGIO
// I passaggi e cosa chiedono si decidono da Gestione -> Creazione personaggio
// (vedi lib/creation-flow.ts). Qui ci sono le scelte salvate nella bozza e
// i limiti di sicurezza dei valori che arrivano dal browser.
// =====================================================================

export const SEXES = [
  { id: "uomo", label: "Uomo" },
  { id: "donna", label: "Donna" },
] as const;

export const AGE_MIN = 16;
export const AGE_MAX = 80;

// Statistiche del regolamento (INT, REF, BODY, EMP, PRE, WILL): i numeri
// stanno in lib/rules/config.ts
export const ATTRIBUTES = RULES.stats;

export const TEXT_MAX = 4000;

export type CustomValue = string | number | boolean | string[];

export type CreationData = {
  sex?: string;
  age?: number;
  attributes?: Record<string, number>;
  appearance?: string;
  story?: string;
  items?: string[]; // oggetti di partenza scelti (disponibili all'iscrizione)
  skills?: Record<string, number>; // id abilita' -> livello
  traits?: { id: string; choice?: string }[]; // vantaggi e svantaggi scelti
  height?: string;
  eye_color?: string;
  hair_color?: string;
  visible_marks?: string;
  face_claim?: string; // prestavolto (nome e cognome)
  birth_day?: number; // giorno e luna di nascita (l'anno si ricava dall'eta')
  birth_month?: number;
  house_role_id?: string; // ruolo di casata scelto (tra quelli aperti all'iscrizione)
  dragon_id?: string; // drago o uovo della casata reclamato
  custom?: Record<string, CustomValue>; // campi personalizzati (chiave -> valore)
};

// Catalogo dei tratti che serve per controllare i tratti scelti
export type TraitInfo = {
  id: string;
  name: string;
  kind: "vantaggio" | "svantaggio";
  cost: number;
  choice: "nessuna" | "abilita" | "statistica";
  unique_group: string | null;
  requires_master: boolean;
  active: boolean;
};

const ids = (list: readonly { id: string }[]) => list.map((x) => x.id);

export function labelOf(
  list: readonly { id: string; label: string }[],
  id?: string | null,
) {
  return list.find((x) => x.id === id)?.label ?? "—";
}

const uuid = (x: unknown): x is string =>
  typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x);
const text = (x: unknown, max: number) =>
  typeof x === "string" ? x.slice(0, max) : undefined;

// Tiene solo campi noti e valori nel formato giusto (i dati arrivano dal browser).
// I limiti veri (punti, minimi, massimi) li controlla la creazione configurata
export function sanitizeCreationData(raw: unknown): CreationData {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const out: CreationData = {};

  if (typeof input.sex === "string" && ids(SEXES).includes(input.sex))
    out.sex = input.sex;
  if (Number.isInteger(input.age)) out.age = input.age as number;
  if (Array.isArray(input.items))
    out.items = [...new Set(input.items.filter(uuid))].slice(0, 20);
  if (input.attributes && typeof input.attributes === "object") {
    const attrs = input.attributes as Record<string, unknown>;
    // statistiche gestite dal pannello: chiavi semplici, valori interi 1-10
    out.attributes = Object.fromEntries(
      Object.entries(attrs)
        .filter(([k, v]) => /^[a-z][a-z0-9_]{0,19}$/.test(k) && Number.isInteger(v))
        .slice(0, 30)
        .map(([k, v]) => [k, Math.min(RULES.statMax, Math.max(RULES.statMin, v as number))]),
    );
  }
  if (input.skills && typeof input.skills === "object") {
    out.skills = Object.fromEntries(
      Object.entries(input.skills as Record<string, unknown>)
        .filter(
          ([id, v]) => uuid(id) && Number.isInteger(v) && (v as number) > 0,
        )
        .map(([id, v]) => [id, Math.min(RULES.skillMax, v as number)])
        .slice(0, 60),
    );
  }
  if (Array.isArray(input.traits)) {
    const seen = new Set<string>();
    out.traits = input.traits
      .filter(
        (t): t is { id: string; choice?: unknown } =>
          !!t && typeof t === "object" && uuid((t as { id?: unknown }).id),
      )
      .filter((t) => !seen.has(t.id) && !!seen.add(t.id))
      .slice(0, 10)
      .map((t) =>
        typeof t.choice === "string" && t.choice
          ? { id: t.id, choice: t.choice.slice(0, 60) }
          : { id: t.id },
      );
  }
  out.appearance = text(input.appearance, TEXT_MAX);
  out.story = text(input.story, TEXT_MAX);
  out.height = text(input.height, 30);
  out.eye_color = text(input.eye_color, 40);
  out.hair_color = text(input.hair_color, 40);
  out.visible_marks = text(input.visible_marks, 300);
  out.face_claim = text(input.face_claim, 80)?.replace(/\s+/g, " ");
  if (uuid(input.house_role_id)) out.house_role_id = input.house_role_id;
  if (Number.isInteger(input.birth_day) && (input.birth_day as number) >= 1 && (input.birth_day as number) <= 31)
    out.birth_day = input.birth_day as number;
  if (Number.isInteger(input.birth_month) && (input.birth_month as number) >= 1 && (input.birth_month as number) <= 12)
    out.birth_month = input.birth_month as number;
  if (uuid(input.dragon_id)) out.dragon_id = input.dragon_id;
  if (input.custom && typeof input.custom === "object") {
    const custom: Record<string, CustomValue> = {};
    for (const [k, v] of Object.entries(
      input.custom as Record<string, unknown>,
    ).slice(0, 60)) {
      if (!/^[a-z0-9_]{1,40}$/.test(k)) continue;
      if (typeof v === "string") custom[k] = v.slice(0, TEXT_MAX);
      else if (typeof v === "number" && Number.isFinite(v)) custom[k] = v;
      else if (typeof v === "boolean") custom[k] = v;
      else if (Array.isArray(v))
        custom[k] = v
          .filter((x): x is string => typeof x === "string")
          .slice(0, 30)
          .map((x) => x.slice(0, 100));
    }
    out.custom = custom;
  }
  for (const k of Object.keys(out) as (keyof CreationData)[])
    if (out[k] === undefined) delete out[k];
  return out;
}
