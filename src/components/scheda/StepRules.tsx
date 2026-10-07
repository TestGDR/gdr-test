"use client";

import type { CreationData } from "@/lib/character-creation";
import {
  skillCap,
  skillPoints,
  skillPointsLeft,
  type BlockConfig,
} from "@/lib/creation-flow";
import {
  choiceLabel,
  statCode,
  type Skill,
  type Trait,
} from "@/lib/rules/catalog";
import { RULES } from "@/lib/rules/config";
import { traitBudget } from "@/lib/rules/engine";

type Props = {
  data: CreationData;
  update: (patch: Partial<CreationData>) => void;
  c: BlockConfig; // impostazioni del blocco (dal pannello)
};

// ---------------------------------------------------------------------
// Creazione: abilita' (punti e massimo per abilita' dal pannello)
// ---------------------------------------------------------------------
export function StepSkills({
  data,
  update,
  c,
  skills,
}: Props & { skills: Skill[] | null }) {
  const levels = data.skills ?? {};
  const left = skillPointsLeft(data, c);
  const stats = data.attributes ?? {};

  const change = (id: string, delta: number) => {
    const next = { ...levels, [id]: Math.max(0, (levels[id] ?? 0) + delta) };
    if (!next[id]) delete next[id];
    update({ skills: next });
  };

  if (!skills) return <p className="text-muted">Caricamento...</p>;

  return (
    <div>
      <p className="mb-4 text-sm text-muted">
        {data.age ? (
          <>
            I punti abilità dipendono dall&apos;età: {data.age} anni +{" "}
            {c.age_bonus ?? 0} ={" "}
            <strong className="text-foreground">
              {skillPoints(data, c)} punti
            </strong>
            .
          </>
        ) : (
          <>
            I punti abilità sono età + {c.age_bonus ?? 0}: indica prima
            l&apos;età.
          </>
        )}{" "}
        Ogni abilità arriva al massimo al valore della sua statistica, sempre
        (anche in gioco); alla creazione comunque non oltre{" "}
        {RULES.creation.skillMax}, in gioco fino a {RULES.skillMax}. I livelli
        presi ora sono gratuiti; in gioco si sale spendendo PX.{" "}
        <strong className={left === 0 ? "text-green-400" : "text-accent"}>
          {left} punt{left === 1 ? "o" : "i"} rimast{left === 1 ? "o" : "i"}
        </strong>
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {RULES.stats.map((s) => {
          const list = skills.filter((k) => k.stat === s.id && k.active);
          if (!list.length) return null;
          return (
            <section key={s.id}>
              <h4 className="mb-1 flex justify-between border-b border-border pb-1 text-sm font-semibold text-accent">
                {s.label}
                <span className="text-xs text-muted">
                  {s.code} {stats[s.id] ?? "—"}
                </span>
              </h4>
              <ul className="space-y-1">
                {list.map((k) => {
                  const v = levels[k.id] ?? 0;
                  const cap = skillCap(data, c, k.stat);
                  return (
                    <li
                      key={k.id}
                      className="flex items-center justify-between gap-2 text-sm"
                      title={k.description || undefined}
                    >
                      <span
                        className={
                          v > cap ? "text-red-400" : v ? "" : "text-muted"
                        }
                      >
                        {k.name}{" "}
                        <span className="text-xs text-muted">(max {cap})</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => change(k.id, -1)}
                          disabled={v <= 0}
                          aria-label={`Togli un punto a ${k.name}`}
                          className="h-6 w-6 border border-border hover:border-accent disabled:opacity-30"
                        >
                          −
                        </button>
                        <strong className="w-4 text-center text-accent">
                          {v}
                        </strong>
                        <button
                          type="button"
                          onClick={() => change(k.id, +1)}
                          disabled={v >= cap || left <= 0}
                          aria-label={`Aggiungi un punto a ${k.name}`}
                          className="h-6 w-6 border border-border hover:border-accent disabled:opacity-30"
                        >
                          +
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Creazione: vantaggi e svantaggi (limiti dal pannello)
// ---------------------------------------------------------------------
export function StepTraits({
  data,
  update,
  c,
  traits,
  skills,
}: Props & { traits: Trait[] | null; skills: Skill[] }) {
  if (!traits) return <p className="text-muted">Caricamento...</p>;
  const chosen = data.traits ?? [];
  const limits = {
    advantagePoints: c.advantage_points!,
    flawsMax: c.flaws_max!,
    flawValueMax: c.flaw_value_max!,
    advantagesMax: c.advantages_max!,
  };
  const picks = chosen
    .map((x) => traits.find((t) => t.id === x.id))
    .filter((t): t is Trait => !!t)
    .map((t) => ({
      kind: t.kind,
      cost: t.cost,
      name: t.name,
      uniqueGroup: t.unique_group,
    }));
  const { available, spent, flawValue } = traitBudget(picks, limits);

  const toggle = (t: Trait) =>
    update({
      traits: chosen.some((x) => x.id === t.id)
        ? chosen.filter((x) => x.id !== t.id)
        : [...chosen, { id: t.id }],
    });
  const setChoice = (id: string, choice: string) =>
    update({
      traits: chosen.map((x) =>
        x.id === id ? { id, choice: choice || undefined } : x,
      ),
    });

  return (
    <div>
      <p className="mb-2 text-sm text-muted">
        Hai {limits.advantagePoints} punti per i vantaggi. Ogni svantaggio ti dà
        tanti punti in più quanto il suo valore (al massimo {limits.flawsMax}{" "}
        svantaggi per {limits.flawValueMax} punti). Al massimo{" "}
        {limits.advantagesMax} vantaggi; ogni tratto si prende una volta sola. I
        tratti sono facoltativi.
      </p>
      <p className="mb-4 text-sm">
        Punti vantaggi:{" "}
        <strong className={spent > available ? "text-red-400" : "text-accent"}>
          {spent} / {available}
        </strong>{" "}
        <span className="text-muted">
          (svantaggi: {flawValue} / {limits.flawValueMax})
        </span>
      </p>
      <div className="grid gap-5 sm:grid-cols-2">
        {(["vantaggio", "svantaggio"] as const).map((kind) => (
          <section key={kind}>
            <h4 className="mb-2 border-b border-border pb-1 text-sm font-semibold text-accent">
              {kind === "vantaggio" ? "Vantaggi (costo)" : "Svantaggi (valore)"}
            </h4>
            <ul className="space-y-2">
              {traits
                .filter(
                  (t) => t.kind === kind && t.active && !t.requires_master,
                )
                .map((t) => {
                  const pick = chosen.find((x) => x.id === t.id);
                  return (
                    <li
                      key={t.id}
                      className={`border px-3 py-2 text-sm transition ${pick ? "border-accent bg-accent/10" : "border-border"}`}
                    >
                      <label className="flex cursor-pointer items-start gap-2">
                        <input
                          type="checkbox"
                          checked={!!pick}
                          onChange={() => toggle(t)}
                          className="mt-1"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex justify-between gap-2">
                            <strong className="font-semibold">{t.name}</strong>
                            <span className="text-accent">{t.cost}</span>
                          </span>
                          <span className="block text-xs text-muted">
                            {t.effect}
                          </span>
                        </span>
                      </label>
                      {pick && t.choice !== "nessuna" && (
                        <select
                          value={pick.choice ?? ""}
                          onChange={(e) => setChoice(t.id, e.target.value)}
                          className="input mt-2 py-1 text-sm"
                        >
                          <option value="">
                            {t.choice === "abilita"
                              ? "Scegli l'abilità..."
                              : "Scegli la statistica..."}
                          </option>
                          {t.choice === "abilita"
                            ? skills
                                .filter((k) => k.active)
                                .map((k) => (
                                  <option key={k.id} value={k.id}>
                                    {k.name} ({statCode(k.stat)})
                                  </option>
                                ))
                            : RULES.stats.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.label}
                                </option>
                              ))}
                        </select>
                      )}
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

// Riepilogo: abilita' e tratti scelti
export function SkillsSummary({
  data,
  skills,
}: {
  data: CreationData;
  skills: Skill[] | null;
}) {
  const levels = Object.entries(data.skills ?? {}).filter(([, v]) => v > 0);
  return (
    <div className="flex flex-wrap gap-2">
      {levels.length === 0 && <span className="text-muted">—</span>}
      {levels.map(([id, v]) => (
        <span key={id} className="border border-border px-2 py-1">
          {skills?.find((k) => k.id === id)?.name ?? "?"}{" "}
          <strong className="text-accent">{v}</strong>
        </span>
      ))}
    </div>
  );
}

export function TraitsSummary({
  data,
  skills,
  traits,
}: {
  data: CreationData;
  skills: Skill[] | null;
  traits: Trait[] | null;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {(data.traits ?? []).length === 0 && (
        <span className="text-muted">—</span>
      )}
      {(data.traits ?? []).map((x) => {
        const t = traits?.find((y) => y.id === x.id);
        if (!t) return null;
        const ch = choiceLabel(t, x.choice, skills ?? []);
        return (
          <span key={x.id} className="border border-border px-2 py-1">
            <span
              className={
                t.kind === "vantaggio" ? "text-green-400" : "text-red-400"
              }
            >
              {t.kind === "vantaggio" ? "+" : "−"}
            </span>{" "}
            {t.name}
            {ch && <span className="text-accent"> · {ch}</span>}
          </span>
        );
      })}
    </div>
  );
}
