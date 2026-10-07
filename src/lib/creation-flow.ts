// =====================================================================
// CREAZIONE DEL PERSONAGGIO CONFIGURABILE
// I passaggi (creation_steps) e i blocchi dentro ogni passaggio
// (creation_blocks) si decidono da Gestione -> Creazione personaggio.
// Qui ci sono i tipi di blocco, i loro valori predefiniti e i controlli
// usati sia dalla procedura guidata (browser) sia dal server.
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AGE_MAX,
  AGE_MIN,
  SEXES,
  type CreationData,
  type TraitInfo,
} from "@/lib/character-creation";
import { RULES } from "@/lib/rules/config";
import {
  skillLevelCap,
  validateTraits,
  type TraitPick,
} from "@/lib/rules/engine";

export type BlockKind =
  | "sesso"
  | "eta"
  | "statistiche"
  | "abilita"
  | "tratti"
  | "aspetto"
  | "storia"
  | "dati_fisici"
  | "equipaggiamento"
  | "prestavolto"
  | "casata"
  | "drago"
  | "testo"
  | "campo";

export type FieldType =
  "testo" | "testo_lungo" | "numero" | "scelta" | "scelta_multipla" | "si_no";
export type FieldVisibility = "pubblico" | "riservato" | "nascosto";

export type BlockConfig = {
  label?: string; // titolo del blocco (facoltativo)
  help?: string; // spiegazione sotto il titolo
  // eta
  min?: number;
  max?: number;
  // abilita: punti da distribuire alla creazione = eta' + age_bonus
  age_bonus?: number;
  // statistiche / abilita
  points?: number;
  // tratti
  advantage_points?: number;
  flaws_max?: number;
  flaw_value_max?: number;
  advantages_max?: number;
  // aspetto / storia
  min_chars?: number;
  placeholder?: string;
  // dati fisici: quali campi chiedere e se sono obbligatori
  fields?: ("height" | "eye_color" | "hair_color" | "visible_marks")[];
  required?: boolean;
  // testo informativo
  body?: string;
  // equipaggiamento: monete per comprare gli oggetti di partenza
  coins?: number;
  keep_change?: boolean; // le monete avanzate restano al PG
  // campo personalizzato
  key?: string;
  type?: FieldType;
  options?: string[];
  max_len?: number;
  max_choices?: number;
  visibility?: FieldVisibility;
};

export type CreationBlock = {
  id: string;
  step_id: string;
  kind: BlockKind;
  sort_order: number;
  config: BlockConfig;
};
export type CreationStep = {
  id: string;
  title: string;
  description: string;
  sort_order: number;
  blocks: CreationBlock[];
};

// Tipi di blocco: "unique" = al massimo uno in tutta la creazione;
// "required" = non si puo' togliere (serve al gioco)
export const BLOCK_KINDS: Record<
  BlockKind,
  { label: string; description: string; unique: boolean; required?: boolean }
> = {
  sesso: {
    label: "Sesso",
    description: "Uomo o donna (serve, per esempio, alle gravidanze).",
    unique: true,
    required: true,
  },
  eta: {
    label: "Età",
    description: "Età del personaggio, tra un minimo e un massimo.",
    unique: true,
    required: true,
  },
  statistiche: {
    label: "Statistiche",
    description: "Le 6 statistiche del regolamento, a punti.",
    unique: true,
  },
  abilita: {
    label: "Abilità",
    description: "Punti da distribuire tra le abilità del regolamento.",
    unique: true,
  },
  tratti: {
    label: "Vantaggi e svantaggi",
    description: "I tratti del regolamento, con i loro punti.",
    unique: true,
  },
  aspetto: {
    label: "Aspetto",
    description:
      "Descrizione dell'aspetto (va nella pagina Aspetto della scheda).",
    unique: true,
  },
  storia: {
    label: "Storia",
    description:
      "Il background (va nella Storia, visibile solo alla proprietaria e allo staff; alla conferma va in approvazione e si blocca).",
    unique: true,
  },
  dati_fisici: {
    label: "Dati fisici",
    description:
      "Altezza, colore occhi, colore capelli, segni visibili (pagina Dati).",
    unique: true,
  },
  equipaggiamento: {
    label: "Equipaggiamento",
    description:
      "Oggetti di partenza disponibili all'iscrizione, comprati con le monete della creazione.",
    unique: true,
  },
  casata: {
    label: "Casata e ruolo",
    description:
      "La casata e il ruolo, tra quelli aperti all'iscrizione (con i posti liberi, il sesso e l'età richiesti). Va messo dopo Sesso ed Età.",
    unique: true,
  },
  drago: {
    label: "Drago",
    description:
      "Se la casata scelta ha draghi o uova liberi, il PG ne può reclamare uno solo. Va messo dopo Casata e ruolo.",
    unique: true,
  },
  prestavolto: {
    label: "Prestavolto",
    description:
      "Nome e cognome del prestavolto, con il controllo che non sia già usato. Dopo la creazione non si cambia più (solo l'admin).",
    unique: true,
  },
  testo: {
    label: "Testo informativo",
    description:
      "Un testo da leggere (regole, consigli, avvisi). Non chiede niente.",
    unique: false,
  },
  campo: {
    label: "Campo personalizzato",
    description: "Un dato nuovo: testo, numero, scelta, sì/no...",
    unique: false,
  },
};

export const FIELD_TYPES: Record<FieldType, string> = {
  testo: "Testo breve",
  testo_lungo: "Testo lungo",
  numero: "Numero",
  scelta: "Scelta singola (elenco)",
  scelta_multipla: "Scelta multipla (elenco)",
  si_no: "Sì / No",
};

export const VISIBILITY: Record<FieldVisibility, string> = {
  pubblico: "Visibile a tutti nella scheda (pagina Dati)",
  riservato: "Visibile solo alla proprietaria e allo staff",
  nascosto: "Non mostrato nella scheda (lo vede lo staff nei dati)",
};

export const PHYSICAL_FIELDS = [
  { id: "height", label: "Altezza", max: 30 },
  { id: "eye_color", label: "Colore occhi", max: 40 },
  { id: "hair_color", label: "Colore capelli", max: 40 },
  { id: "visible_marks", label: "Segni visibili", max: 300 },
] as const;

// Valori predefiniti di ogni tipo (quelli del regolamento)
export function defaultConfig(kind: BlockKind): BlockConfig {
  const c = RULES.creation;
  switch (kind) {
    case "eta":
      return { min: AGE_MIN, max: AGE_MAX };
    case "statistiche":
      return { points: c.statPoints, min: c.statMin, max: c.statMax };
    case "abilita":
      return { age_bonus: 10 };
    case "tratti":
      return {
        advantage_points: c.advantagePoints,
        flaws_max: c.flawsMax,
        flaw_value_max: c.flawValueMax,
        advantages_max: c.advantagesMax,
      };
    case "aspetto":
      return {
        min_chars: 30,
        placeholder: "Corporatura, volto, segni particolari, abbigliamento...",
      };
    case "storia":
      return {
        min_chars: 100,
        placeholder: "Da dove viene, cosa ha vissuto, cosa cerca...",
      };
    case "dati_fisici":
      return {
        fields: ["height", "eye_color", "hair_color", "visible_marks"],
        required: false,
      };
    case "prestavolto":
      return { required: true, placeholder: "Es. Emilia Clarke" };
    case "equipaggiamento":
      return { coins: 100, keep_change: true };
    case "casata":
      return { required: true };
    case "testo":
      return { body: "" };
    case "campo":
      return {
        label: "Nuovo campo",
        type: "testo",
        required: false,
        max_len: 200,
        visibility: "pubblico",
        options: [],
      };
    default:
      return {};
  }
}

// Configurazione completa (predefiniti + valori scelti dallo staff)
export const cfg = (
  block: Pick<CreationBlock, "kind" | "config">,
): BlockConfig => ({
  ...defaultConfig(block.kind),
  ...(block.config ?? {}),
});

// Carica passaggi e blocchi in ordine
export async function loadFlow(
  supabase: SupabaseClient,
): Promise<CreationStep[]> {
  const [{ data: steps }, { data: blocks }] = await Promise.all([
    supabase
      .from("creation_steps")
      .select("id, title, description, sort_order")
      .order("sort_order"),
    supabase
      .from("creation_blocks")
      .select("id, step_id, kind, sort_order, config")
      .order("sort_order"),
  ]);
  return ((steps ?? []) as Omit<CreationStep, "blocks">[]).map((s) => ({
    ...s,
    blocks: ((blocks ?? []) as CreationBlock[]).filter(
      (b) => b.step_id === s.id,
    ),
  }));
}

export const allBlocks = (steps: CreationStep[]) =>
  steps.flatMap((s) => s.blocks);

export const hasBlock = (steps: CreationStep[], kind: BlockKind) =>
  allBlocks(steps).some((b) => b.kind === kind);

// ---------------------------------------------------------------------
// Controlli
// ---------------------------------------------------------------------
export type FlowContext = {
  traits?: TraitInfo[];
  skillIds?: Set<string>;
  skillStats?: Record<string, string>; // id abilita' -> statistica collegata
};

// Livello massimo di un'abilita' alla creazione: il valore della statistica
// collegata, senza superare il massimo del blocco Abilita' (es. 8)
export function skillCap(
  data: CreationData,
  c: BlockConfig,
  stat: string | undefined,
) {
  const v = stat ? data.attributes?.[stat] : undefined;
  return skillLevelCap(v ?? RULES.creation.skillMax, true);
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function statPointsLeft(data: CreationData, c: BlockConfig) {
  const used = RULES.stats.reduce(
    (s, x) => s + (data.attributes?.[x.id] ?? c.min!),
    0,
  );
  return c.points! - used;
}

// Punti abilita' della creazione: eta' del personaggio + N (dal pannello)
export function skillPoints(data: CreationData, c: BlockConfig) {
  return data.age ? data.age + (c.age_bonus ?? 0) : 0;
}

export function skillPointsLeft(data: CreationData, c: BlockConfig) {
  return (
    skillPoints(data, c) -
    Object.values(data.skills ?? {}).reduce((a, b) => a + (b || 0), 0)
  );
}

function traitError(
  data: CreationData,
  c: BlockConfig,
  catalog: TraitInfo[],
): string | null {
  const picks: TraitPick[] = [];
  for (const t of data.traits ?? []) {
    const info = catalog.find((x) => x.id === t.id);
    if (!info || !info.active)
      return "Uno dei tratti scelti non esiste più: toglilo.";
    if (info.requires_master)
      return `"${info.name}" si ottiene solo con il permesso del Master.`;
    if (info.choice !== "nessuna" && !t.choice)
      return `Per "${info.name}" scegli ${info.choice === "abilita" ? "l'abilità" : "la statistica"}.`;
    picks.push({
      kind: info.kind,
      cost: info.cost,
      name: info.name,
      uniqueGroup: info.unique_group,
    });
  }
  return (
    validateTraits(picks, {
      advantagePoints: c.advantage_points!,
      flawsMax: c.flaws_max!,
      flawValueMax: c.flaw_value_max!,
      advantagesMax: c.advantages_max!,
    })[0] ?? null
  );
}

// Errore di un blocco, oppure null. Senza catalogo i tratti si controllano solo sul server
export function validateBlock(
  block: CreationBlock,
  data: CreationData,
  ctx: FlowContext = {},
): string | null {
  const c = cfg(block);
  switch (block.kind) {
    case "sesso":
      return data.sex && SEXES.some((s) => s.id === data.sex)
        ? null
        : "Scegli il sesso del personaggio.";
    case "eta":
      return data.age && data.age >= c.min! && data.age <= c.max!
        ? null
        : `L'età deve essere tra ${c.min} e ${c.max} anni.`;
    case "statistiche": {
      for (const s of RULES.stats) {
        const v = data.attributes?.[s.id] ?? c.min!;
        if (v < c.min! || v > c.max!)
          return `${s.label}: da ${c.min} a ${c.max}.`;
      }
      const left = statPointsLeft(data, c);
      if (left > 0)
        return `Devi ancora distribuire ${left} ${plural(left, "punto", "punti")} statistica.`;
      if (left < 0)
        return "Hai usato più punti statistica di quelli disponibili.";
      return null;
    }
    case "abilita": {
      if (
        Object.values(data.skills ?? {}).some(
          (v) => v > RULES.creation.skillMax,
        )
      )
        return `Alla creazione un'abilità arriva al massimo a ${RULES.creation.skillMax}.`;
      if (ctx.skillStats)
        for (const [id, v] of Object.entries(data.skills ?? {})) {
          const stat = ctx.skillStats[id];
          const cap = skillCap(data, c, stat);
          if (v > cap) {
            const s = RULES.stats.find((x) => x.id === stat);
            return `Un'abilità di ${s?.label ?? "una statistica"} supera il massimo (${cap}, il valore di ${s?.code ?? "?"}): abbassala.`;
          }
        }
      if (
        ctx.skillIds &&
        Object.keys(data.skills ?? {}).some((id) => !ctx.skillIds!.has(id))
      )
        return "Una delle abilità scelte non esiste più: ricontrolla le abilità.";
      if (!data.age)
        return (
          "Indica prima l'età: i punti abilità sono età + " +
          (c.age_bonus ?? 0) +
          "."
        );
      const left = skillPointsLeft(data, c);
      if (left > 0)
        return `Devi ancora distribuire ${left} ${plural(left, "punto", "punti")} abilità.`;
      if (left < 0) return "Hai usato più punti abilità di quelli disponibili.";
      return null;
    }
    case "tratti":
      return ctx.traits ? traitError(data, c, ctx.traits) : null;
    case "aspetto":
      return (data.appearance?.trim().length ?? 0) >= c.min_chars!
        ? null
        : `Descrivi l'aspetto con almeno ${c.min_chars} caratteri.`;
    case "storia":
      return (data.story?.trim().length ?? 0) >= c.min_chars!
        ? null
        : `Scrivi una storia di almeno ${c.min_chars} caratteri.`;
    case "casata":
      if (!data.house_role_id) {
        if (!c.required) return null;
        return data.sex && data.age
          ? "Scegli la casata e il ruolo."
          : "Indica prima sesso ed età: i ruoli disponibili dipendono da questi.";
      }
      return null;
    case "drago":
      if (data.dragon_id && !data.house_role_id)
        return "Scegli prima la casata.";
      return null;
    case "prestavolto": {
      const v = data.face_claim?.trim() ?? "";
      if (!v)
        return c.required ? "Scrivi il prestavolto (nome e cognome)." : null;
      if (v.length < 3) return "Il prestavolto è troppo corto.";
      if (v.length > 80) return "Il prestavolto è troppo lungo.";
      return null;
    }
    case "dati_fisici":
      if (c.required)
        for (const f of PHYSICAL_FIELDS)
          if (c.fields?.includes(f.id) && !String(data[f.id] ?? "").trim())
            return `Compila "${f.label}".`;
      return null;
    case "campo":
      return validateCustom(c, data.custom?.[c.key ?? ""]);
    default:
      return null;
  }
}

function validateCustom(c: BlockConfig, v: unknown): string | null {
  const name = c.label || "il campo";
  const empty =
    v === undefined ||
    v === null ||
    v === "" ||
    (Array.isArray(v) && v.length === 0) ||
    (typeof v === "string" && !v.trim());
  if (empty) return c.required ? `Compila "${name}".` : null;
  switch (c.type) {
    case "numero": {
      const n = Number(v);
      if (!Number.isFinite(n)) return `"${name}" deve essere un numero.`;
      if (c.min !== undefined && c.min !== null && n < c.min)
        return `"${name}": minimo ${c.min}.`;
      if (c.max !== undefined && c.max !== null && n > c.max)
        return `"${name}": massimo ${c.max}.`;
      return null;
    }
    case "scelta":
      return (c.options ?? []).includes(String(v))
        ? null
        : `Scegli un valore per "${name}".`;
    case "scelta_multipla": {
      const list = Array.isArray(v) ? v : [];
      if (list.some((x) => !(c.options ?? []).includes(String(x))))
        return `Scelta non valida in "${name}".`;
      if (c.max_choices && list.length > c.max_choices)
        return `"${name}": al massimo ${c.max_choices} scelte.`;
      return null;
    }
    case "si_no":
      return typeof v === "boolean" ? null : `Rispondi a "${name}".`;
    default:
      return String(v).length > (c.max_len ?? 4000)
        ? `"${name}" è troppo lungo.`
        : null;
  }
}

// Errore di un passaggio (il primo dei suoi blocchi), oppure null
export function validateFlowStep(
  step: CreationStep | undefined,
  data: CreationData,
  ctx: FlowContext = {},
) {
  for (const b of step?.blocks ?? []) {
    const e = validateBlock(b, data, ctx);
    if (e) return e;
  }
  return null;
}

export function firstInvalidFlowStep(
  steps: CreationStep[],
  data: CreationData,
  ctx: FlowContext = {},
) {
  const i = steps.findIndex((s) => validateFlowStep(s, data, ctx));
  return i < 0 ? null : i;
}

// Chiave di un campo personalizzato a partire dal nome
export function fieldKey(label: string, taken: string[]) {
  const base =
    label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 30) || "campo";
  let key = base;
  for (let i = 2; taken.includes(key); i++) key = `${base}_${i}`;
  return key;
}

// Testo di un valore personalizzato
export function customValueText(c: BlockConfig, v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (c.type === "si_no") return v ? "Sì" : "No";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  return String(v);
}
