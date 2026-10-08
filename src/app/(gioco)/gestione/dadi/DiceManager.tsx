"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  DICE_VARS,
  formulaVars,
  parseFormula,
  rollFormula,
  type DiceRule,
  type DiceVar,
} from "@/lib/rules/dice";
import { useStats } from "@/lib/rules/useStats";
import { createClient } from "@/lib/supabase/client";

export type DiceTypeRow = {
  id: string;
  name: string;
  description: string;
  formula: string;
  rules: DiceRule[];
  ask_target: boolean;
  staff_only: boolean;
  sort_order: number;
  active: boolean;
};
type Draft = Omit<DiceTypeRow, "id"> & { id?: string };

const lbl = "mb-1 block text-xs tracking-wider text-muted uppercase";
const empty = (): Draft => ({
  name: "",
  description: "",
  formula: "1d10",
  rules: [],
  ask_target: false,
  staff_only: false,
  sort_order: 0,
  active: true,
});

const WHEN: Record<DiceRule["when"], string> = {
  naturale: "il dado (primo gruppo di dadi)",
  totale: "il totale",
  margine: "il margine (totale − DV)",
};
const ACTION: Record<DiceRule["action"], string> = {
  aggiungi: "aggiungi",
  sottrai: "sottrai",
  esito: "scrivi l'esito",
};

// Valori di prova per le variabili (anteprima del tiro nel pannello)
const SAMPLE: Partial<Record<DiceVar, number | string>> = {
  STAT: 5,
  ABILITA: 3,
  TRATTI: 1,
  ARMA: "2d5",
  MOD: 0,
  ONORE: 5,
  DSTAT: 4,
  DABILITA: 3,
  DTRATTI: 0,
};

export default function DiceManager({ dice }: { dice: DiceTypeRow[] }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [edit, setEdit] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [test, setTest] = useState<string[]>([]);
  // sigle delle statistiche (es. REF, BODY) usabili nelle formule
  const stats = useStats();
  const codes = stats.map((s) => s.code);
  const sample = { ...SAMPLE, ...Object.fromEntries(codes.map((c) => [c, 5])) };

  const parsed = edit ? parseFormula(edit.formula, codes) : null;
  const formulaError = parsed && "error" in parsed ? parsed.error : null;

  async function save() {
    if (!edit || formulaError) return;
    setBusy(true);
    setMsg(null);
    const row = {
      ...edit,
      name: edit.name.trim(),
      description: edit.description.trim(),
      formula: edit.formula.trim(),
    };
    const { error } = row.id
      ? await supabase.from("dice_types").update(row).eq("id", row.id)
      : await supabase.from("dice_types").insert(row);
    setBusy(false);
    if (error)
      return setMsg({
        ok: false,
        text:
          error.code === "23505"
            ? "Esiste già un tiro con questo nome."
            : "Salvataggio non riuscito.",
      });
    setMsg({ ok: true, text: "Tiro salvato." });
    setEdit(null);
    router.refresh();
  }

  async function remove(d: DiceTypeRow) {
    if (
      !window.confirm(
        `Eliminare il tiro "${d.name}"? I tiri già fatti in chat restano.`,
      )
    )
      return;
    const { error } = await supabase.from("dice_types").delete().eq("id", d.id);
    if (error) return setMsg({ ok: false, text: "Eliminazione non riuscita." });
    router.refresh();
  }

  function tryRoll() {
    if (!edit || formulaError) return;
    const out: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = rollFormula(
        edit.formula,
        edit.rules,
        { vars: sample, target: edit.ask_target ? 15 : null },
        Math.random,
        codes,
      );
      out.push("error" in r ? r.error : r.text);
    }
    setTest(out);
  }

  const setRule = (i: number, patch: Partial<DiceRule>) =>
    edit &&
    setEdit({
      ...edit,
      rules: edit.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)),
    });

  return (
    <div className="space-y-5">
      {msg && (
        <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>
          {msg.text}
        </p>
      )}

      {edit ? (
        <div className="space-y-4 border border-accent/40 bg-black/40 p-4">
          <div className="flex flex-wrap gap-3">
            <label className="block min-w-56 flex-1">
              <span className={lbl}>Nome del tiro</span>
              <input
                value={edit.name}
                maxLength={60}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                className="input py-1.5"
              />
            </label>
            <label className="block">
              <span className={lbl}>Ordine</span>
              <input
                type="number"
                value={edit.sort_order}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    sort_order: Math.trunc(Number(e.target.value)) || 0,
                  })
                }
                className="input w-20! py-1.5"
              />
            </label>
          </div>
          <label className="block">
            <span className={lbl}>Descrizione (la vede il giocatore)</span>
            <input
              value={edit.description}
              maxLength={1000}
              onChange={(e) =>
                setEdit({ ...edit, description: e.target.value })
              }
              className="input py-1.5"
            />
          </label>

          <div>
            <label className="block">
              <span className={lbl}>Formula</span>
              <input
                value={edit.formula}
                maxLength={200}
                onChange={(e) => setEdit({ ...edit, formula: e.target.value })}
                className="input py-1.5 font-mono"
                placeholder="es. STAT + ABILITA + 1d10, 2d5+1, ARMA + BODY"
              />
            </label>
            {formulaError ? (
              <p className="mt-1 text-xs text-red-400">{formulaError}</p>
            ) : (
              <p className="mt-1 text-xs text-muted">
                Il giocatore sceglierà:{" "}
                {[...formulaVars(edit.formula, codes)]
                  .filter((v) =>
                    [
                      "STAT",
                      "ABILITA",
                      "ARMA",
                      "MOD",
                      "DSTAT",
                      "DABILITA",
                    ].includes(v),
                  )
                  .join(", ") || "niente"}
                {edit.ask_target ? ", DV" : ""}.
              </p>
            )}
            <details className="mt-2 text-xs text-muted">
              <summary className="cursor-pointer text-accent">
                Come si scrive una formula
              </summary>
              <p className="mt-1">
                Dadi: <code>1d10</code>, <code>2d5</code>, <code>3d6</code>{" "}
                (numero di dadi, d, facce). Numeri: <code>2</code>. Si sommano e
                sottraggono con + e −. Variabili:
              </p>
              <ul className="mt-1 grid gap-x-4 sm:grid-cols-2">
                {(Object.keys(DICE_VARS) as (keyof typeof DICE_VARS)[]).map(
                  (v) => (
                    <li key={v}>
                      <code className="text-foreground">{v}</code> —{" "}
                      {DICE_VARS[v]}
                    </li>
                  ),
                )}
                {stats.map((st) => (
                  <li key={st.id}>
                    <code className="text-foreground">{st.code}</code> —{" "}
                    {st.label} del personaggio
                  </li>
                ))}
              </ul>
            </details>
          </div>

          <div>
            <p className={lbl}>Regole (in ordine)</p>
            <ul className="space-y-2">
              {edit.rules.map((r, i) => (
                <li
                  key={i}
                  className="flex flex-wrap items-center gap-2 border border-border/60 bg-black/30 p-2 text-sm"
                >
                  <span>Se</span>
                  <select
                    value={r.when}
                    onChange={(e) =>
                      setRule(i, { when: e.target.value as DiceRule["when"] })
                    }
                    className="input w-56! py-1 text-sm"
                  >
                    {(Object.keys(WHEN) as DiceRule["when"][]).map((w) => (
                      <option key={w} value={w}>
                        {WHEN[w]}
                      </option>
                    ))}
                  </select>
                  <select
                    value={r.op}
                    onChange={(e) =>
                      setRule(i, { op: e.target.value as DiceRule["op"] })
                    }
                    className="input w-16! py-1 text-sm"
                  >
                    <option value="=">=</option>
                    <option value=">=">≥</option>
                    <option value="<=">≤</option>
                  </select>
                  <input
                    type="number"
                    value={r.value}
                    onChange={(e) =>
                      setRule(i, {
                        value: Math.trunc(Number(e.target.value)) || 0,
                      })
                    }
                    className="input w-20! py-1 text-center text-sm"
                  />
                  <span>→</span>
                  <select
                    value={r.action}
                    onChange={(e) =>
                      setRule(i, {
                        action: e.target.value as DiceRule["action"],
                      })
                    }
                    className="input w-40! py-1 text-sm"
                  >
                    {(Object.keys(ACTION) as DiceRule["action"][]).map((a) => (
                      <option key={a} value={a}>
                        {ACTION[a]}
                      </option>
                    ))}
                  </select>
                  {r.action !== "esito" && (
                    <>
                      <input
                        value={r.formula ?? ""}
                        placeholder="es. 1d10"
                        maxLength={40}
                        onChange={(e) =>
                          setRule(i, { formula: e.target.value })
                        }
                        className="input w-24! py-1 font-mono text-sm"
                      />
                      {r.when === "naturale" && (
                        <label className="flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            checked={!!r.repeat}
                            onChange={(e) =>
                              setRule(i, { repeat: e.target.checked })
                            }
                          />
                          ripeti se il nuovo dado rispetta la condizione
                        </label>
                      )}
                    </>
                  )}
                  <input
                    value={r.label ?? ""}
                    placeholder={
                      r.action === "esito"
                        ? "Esito (es. Critico!)"
                        : "Nota (facoltativa)"
                    }
                    maxLength={60}
                    onChange={(e) => setRule(i, { label: e.target.value })}
                    className="input min-w-40 flex-1 py-1 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setEdit({
                        ...edit,
                        rules: edit.rules.filter((_, j) => j !== i),
                      })
                    }
                    className="text-xs text-muted hover:text-red-400"
                  >
                    Togli
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() =>
                setEdit({
                  ...edit,
                  rules: [
                    ...edit.rules,
                    {
                      when: "naturale",
                      op: "=",
                      value: 10,
                      action: "aggiungi",
                      formula: "1d10",
                    },
                  ],
                })
              }
              className="mt-2 text-sm text-accent hover:underline"
            >
              + Aggiungi una regola
            </button>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={edit.ask_target}
                onChange={(e) =>
                  setEdit({ ...edit, ask_target: e.target.checked })
                }
              />
              Chiedi la DV (difficoltà): servono per il margine e per gli esiti
              &quot;Riuscito/Fallito&quot;
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={edit.staff_only}
                onChange={(e) =>
                  setEdit({ ...edit, staff_only: e.target.checked })
                }
              />
              Solo per i master
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={edit.active}
                onChange={(e) => setEdit({ ...edit, active: e.target.checked })}
              />
              Attivo
            </label>
          </div>

          <div className="space-y-1">
            <button
              type="button"
              disabled={!!formulaError}
              onClick={tryRoll}
              className="btn-ghost px-3 py-1 text-sm"
            >
              Prova il tiro (5 volte)
            </button>
            {test.length > 0 && (
              <ul className="space-y-0.5 border border-border/60 bg-black/30 p-2 font-mono text-xs">
                <li className="text-muted">
                  Valori di prova: statistica 5, abilità 3, tratti +1, arma 2d5
                  {edit.ask_target ? ", DV 15" : ""}
                </li>
                {test.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !edit.name.trim() || !!formulaError}
              onClick={save}
              className="btn px-4 py-1.5 text-sm"
            >
              Salva
            </button>
            <button
              type="button"
              onClick={() => (setEdit(null), setTest([]))}
              className="btn-ghost px-4 py-1.5 text-sm"
            >
              Annulla
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEdit(empty())}
          className="btn px-4 py-1.5 text-sm"
        >
          + Nuovo tiro
        </button>
      )}

      <ul className="space-y-2">
        {dice.map((d) => (
          <li
            key={d.id}
            className="flex flex-wrap items-start justify-between gap-3 border border-border bg-black/30 p-3"
          >
            <div className="min-w-0 flex-1">
              <p
                className={
                  d.active
                    ? "font-serif text-lg text-accent"
                    : "font-serif text-lg text-muted line-through"
                }
              >
                {d.name}
                {d.staff_only && (
                  <span className="ml-2 text-xs text-muted">· solo master</span>
                )}
              </p>
              <p className="font-mono text-sm">{d.formula}</p>
              {d.rules?.length > 0 && (
                <p className="text-xs text-muted">{d.rules.length} regole</p>
              )}
              {d.description && (
                <p className="text-sm text-muted">{d.description}</p>
              )}
            </div>
            <span className="flex shrink-0 gap-3 text-sm">
              <button
                type="button"
                onClick={() => (
                  setEdit({ ...d, rules: d.rules ?? [] }),
                  setTest([])
                )}
                className="text-accent hover:underline"
              >
                Modifica
              </button>
              <button
                type="button"
                onClick={() => remove(d)}
                className="text-muted hover:text-red-400"
              >
                Elimina
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
