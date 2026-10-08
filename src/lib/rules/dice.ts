// =====================================================================
// TIRI DI DADO CONFIGURABILI (Gestione -> Dadi)
// Una formula come "STAT + ABILITA + 1d10" o "2d5+1" e delle regole
// condizionali (es. "se il dado fa 10 aggiungi 1d10 e ripeti").
// Modulo puro: il generatore casuale si passa come parametro.
// =====================================================================

import { RULES } from "./config.ts";
import type { Rng } from "./engine.ts";

// Variabili che si possono usare nelle formule (oltre alle sigle delle
// statistiche, es. REF o BODY: valgono la statistica del personaggio)
export const DICE_VARS = {
  STAT: "Statistica scelta dal giocatore al momento del tiro",
  ABILITA: "Livello dell'abilità scelta (0 se non la possiede)",
  TRATTI:
    "Modificatori dei tratti sempre attivi per statistica/abilità scelte (tra −3 e +3)",
  ARMA: "Danno dell'oggetto scelto (es. 2d5+1), tirato",
  MOD: "Modificatore libero scritto dal giocatore",
  ONORE: "Onore del personaggio",
  DSTAT:
    "Caratteristica del drago scelta (Vigore, Destrezza, Intelletto, Percezione)",
  DABILITA: "Abilità del drago scelta (Volare, Attacco fisico...)",
  DTRATTI:
    "Pregi e difetti del drago sulla caratteristica/abilità scelta (senza condizioni)",
} as const;
export type DiceVar = string;
const DEFAULT_CODES = RULES.stats.map((s) => s.code as string);

export type Term =
  | { sign: 1 | -1; kind: "dice"; count: number; sides: number }
  | { sign: 1 | -1; kind: "num"; value: number }
  | { sign: 1 | -1; kind: "var"; name: DiceVar };

export const MAX_DICE = 50;
export const MAX_SIDES = 1000;

// "STAT + ABILITA + 1d10 - 2" -> termini. Errore se la formula non e' valida
export function parseFormula(
  formula: string,
  statCodes: string[] = DEFAULT_CODES,
): { terms: Term[] } | { error: string } {
  const src = formula.toUpperCase().replace(/\s+/g, "");
  if (!src) return { error: "La formula è vuota." };
  const terms: Term[] = [];
  const re = /([+-]?)(\d*D\d+|\d+|[A-Z]+)/gy;
  let pos = 0;
  while (pos < src.length) {
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m || m.index !== pos || (pos > 0 && !m[1]))
      return { error: `Formula non valida vicino a "${src.slice(pos)}".` };
    const sign = m[1] === "-" ? -1 : 1;
    const tok = m[2];
    const dice = /^(\d*)D(\d+)$/.exec(tok);
    if (dice) {
      const count = dice[1] ? Number(dice[1]) : 1;
      const sides = Number(dice[2]);
      if (count < 1 || count > MAX_DICE)
        return { error: `Si tirano da 1 a ${MAX_DICE} dadi alla volta.` };
      if (sides < 2 || sides > MAX_SIDES)
        return { error: `Un dado ha da 2 a ${MAX_SIDES} facce.` };
      terms.push({ sign, kind: "dice", count, sides });
    } else if (/^\d+$/.test(tok)) {
      terms.push({ sign, kind: "num", value: Number(tok) });
    } else if (tok in DICE_VARS || statCodes.includes(tok)) {
      terms.push({ sign, kind: "var", name: tok });
    } else return { error: `"${tok}" non è una variabile conosciuta.` };
    pos = re.lastIndex;
  }
  if (terms.length > 20) return { error: "Formula troppo lunga." };
  return { terms };
}

// Variabili usate da una formula (servono a sapere cosa chiedere al giocatore)
export function formulaVars(
  formula: string,
  statCodes?: string[],
): Set<DiceVar> {
  const p = parseFormula(formula, statCodes);
  return new Set(
    "terms" in p
      ? p.terms
          .filter((t) => t.kind === "var")
          .map((t) => (t as { name: DiceVar }).name)
      : [],
  );
}

// ---------------------------------------------------------------------
// Regole condizionali
// ---------------------------------------------------------------------
export type RuleWhen = "naturale" | "totale" | "margine";
export type RuleOp = "=" | ">=" | "<=";
export type DiceRule = {
  when: RuleWhen; // naturale = risultato del primo gruppo di dadi della formula
  op: RuleOp;
  value: number;
  action: "aggiungi" | "sottrai" | "esito";
  formula?: string; // per aggiungi/sottrai (es. "1d10")
  repeat?: boolean; // aggiungi/sottrai: ripeti finche' il nuovo tiro rispetta la condizione
  label?: string; // per esito (es. "Critico!") o per spiegare il bonus
};

const test = (v: number, op: RuleOp, x: number) =>
  op === "=" ? v === x : op === ">=" ? v >= x : v <= x;

const die = (rng: Rng, sides: number) => Math.floor(rng() * sides) + 1;

export type RollPart = { label: string; value: number; dice?: number[] };
export type RollResult = {
  total: number;
  natural: number | null; // primo gruppo di dadi
  margin: number | null; // totale - DV
  target: number | null;
  parts: RollPart[];
  outcomes: string[];
  text: string; // riga da mostrare in chat
};

export type RollInput = {
  vars: Partial<Record<DiceVar, number | string>>; // ARMA e' una formula (es. "2d5")
  varLabels?: Partial<Record<DiceVar, string>>; // es. STAT -> "REF", ABILITA -> "Schivare"
  target?: number | null; // DV
};

// Tira una formula semplice (senza variabili) e restituisce somma e dadi
function rollSimple(
  formula: string,
  rng: Rng,
): { value: number; dice: number[] } | { error: string } {
  const p = parseFormula(formula, []);
  if ("error" in p) return p;
  let value = 0;
  const dice: number[] = [];
  for (const t of p.terms) {
    if (t.kind === "var")
      return { error: "Qui non si possono usare variabili." };
    if (t.kind === "num") value += t.sign * t.value;
    else
      for (let i = 0; i < t.count; i++) {
        const r = die(rng, t.sides);
        dice.push(r);
        value += t.sign * r;
      }
  }
  return { value, dice };
}

export function rollFormula(
  formula: string,
  rules: DiceRule[],
  input: RollInput,
  rng: Rng,
  statCodes?: string[],
): RollResult | { error: string } {
  const p = parseFormula(formula, statCodes);
  if ("error" in p) return p;
  const parts: RollPart[] = [];
  let total = 0;
  let natural: number | null = null;

  for (const t of p.terms) {
    if (t.kind === "num") {
      parts.push({ label: String(t.value), value: t.sign * t.value });
    } else if (t.kind === "dice") {
      const dice = Array.from({ length: t.count }, () => die(rng, t.sides));
      const sum = dice.reduce((a, b) => a + b, 0);
      if (natural === null) natural = sum;
      parts.push({ label: `${t.count}d${t.sides}`, value: t.sign * sum, dice });
    } else {
      const v = input.vars[t.name];
      if (t.name === "ARMA") {
        const f = typeof v === "string" && v.trim() ? v : "0";
        const r = rollSimple(f, rng);
        if ("error" in r)
          return { error: `Danno dell'oggetto non valido: ${r.error}` };
        if (natural === null && r.dice.length) natural = r.value;
        parts.push({
          label: `${input.varLabels?.ARMA ?? "Arma"} ${f}`,
          value: t.sign * r.value,
          dice: r.dice,
        });
      } else {
        const n = typeof v === "number" ? v : Number(v) || 0;
        parts.push({
          label: `${input.varLabels?.[t.name] ?? t.name} ${n}`,
          value: t.sign * n,
        });
      }
    }
    total += parts[parts.length - 1].value;
  }

  // Regole su "naturale" che aggiungono o tolgono dadi (anche ripetute)
  for (const r of rules.filter(
    (x) => x.when === "naturale" && x.action !== "esito",
  )) {
    if (natural === null || !test(natural, r.op, r.value)) continue;
    let guard = 0;
    let again = true;
    while (again && guard++ < 20) {
      const extra = rollSimple(r.formula || "0", rng);
      if ("error" in extra)
        return { error: `Regola non valida: ${extra.error}` };
      const sign = r.action === "sottrai" ? -1 : 1;
      parts.push({
        label: r.label || (sign > 0 ? `+${r.formula}` : `−${r.formula}`),
        value: sign * extra.value,
        dice: extra.dice,
      });
      total += sign * extra.value;
      again = !!r.repeat && test(extra.value, r.op, r.value);
    }
  }
  // Regole su totale/margine che aggiungono o tolgono
  const target = typeof input.target === "number" ? input.target : null;
  for (const r of rules.filter(
    (x) => x.when !== "naturale" && x.action !== "esito",
  )) {
    const v =
      r.when === "totale" ? total : target === null ? null : total - target;
    if (v === null || !test(v, r.op, r.value)) continue;
    const extra = rollSimple(r.formula || "0", rng);
    if ("error" in extra) return { error: `Regola non valida: ${extra.error}` };
    const sign = r.action === "sottrai" ? -1 : 1;
    parts.push({
      label: r.label || (sign > 0 ? `+${r.formula}` : `−${r.formula}`),
      value: sign * extra.value,
      dice: extra.dice,
    });
    total += sign * extra.value;
  }

  const margin = target === null ? null : total - target;
  const outcomes = rules
    .filter((r) => r.action === "esito")
    .filter((r) => {
      const v =
        r.when === "naturale" ? natural : r.when === "totale" ? total : margin;
      return v !== null && test(v, r.op, r.value);
    })
    .map((r) => r.label || "")
    .filter(Boolean);

  const partText = parts
    .map((pt, i) => {
      const sign = pt.value < 0 ? "− " : i === 0 ? "" : "+ ";
      const dice =
        pt.dice?.length && (pt.dice.length > 1 || !/^\d+d\d+$/.test(pt.label))
          ? ` [${pt.dice.join(", ")}]`
          : "";
      const shown = pt.dice
        ? `${pt.label}${dice || ` [${pt.dice.join(", ")}]`}`
        : pt.label;
      return `${sign}${shown}`;
    })
    .join(" ");
  const text =
    `${partText} = ${total}` +
    (target !== null
      ? ` contro DV ${target} (margine ${margin! >= 0 ? "+" : ""}${margin})`
      : "") +
    (outcomes.length ? ` — ${outcomes.join(", ")}` : "");
  return { total, natural, margin, target, parts, outcomes, text };
}

// Regole del regolamento per la prova: d10 che esplode e fallimento con l'1
export const REGOLAMENTO_RULES: DiceRule[] = [
  {
    when: "naturale",
    op: "=",
    value: 10,
    action: "aggiungi",
    formula: "1d10",
    repeat: true,
    label: "esplode +1d10",
  },
  {
    when: "naturale",
    op: "=",
    value: 1,
    action: "sottrai",
    formula: "1d10",
    label: "fallimento −1d10",
  },
  { when: "margine", op: ">=", value: 0, action: "esito", label: "Riuscito" },
  { when: "margine", op: "<=", value: -1, action: "esito", label: "Fallito" },
];
