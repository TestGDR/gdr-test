"use client";

import { useState, useTransition } from "react";
import { finalizeCharacter, saveCreationProgress } from "@/app/scheda/actions";
import {
  AGE_MAX,
  AGE_MIN,
  APPEARANCE_MIN,
  ATTRIBUTES,
  ATTRIBUTE_BASE,
  ATTRIBUTE_MAX,
  ATTRIBUTE_POINTS,
  REGIONS,
  SEXES,
  SOCIAL_CLASSES,
  STEPS,
  STORY_MIN,
  TEXT_MAX,
  defaultAttributes,
  labelOf,
  pointsSpent,
  validateStep,
  type CreationData,
} from "@/lib/character-creation";
import type { Character } from "@/lib/types";

type Props = {
  character: Character;
  onExit: () => void;
  onCreated: () => void;
};

const LAST = STEPS.length - 1;

export default function CreationWizard({ character, onExit, onCreated }: Props) {
  const [data, setData] = useState<CreationData>(character.creation_data ?? {});
  const [step, setStep] = useState(Math.min(character.creation_step, LAST));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (patch: Partial<CreationData>) => {
    setData((prev) => ({ ...prev, ...patch }));
    setError(null);
  };

  // Uno step e' raggiungibile se tutti quelli prima sono completi
  const canReach = (target: number) =>
    target <= step || Array.from({ length: target }, (_, i) => i).every((i) => !validateStep(i, data));

  // Salva SEMPRE le scelte prima di cambiare step, avanti o indietro
  function goTo(target: number) {
    if (target > step) {
      const stepError = validateStep(step, data);
      if (stepError) return setError(stepError);
      if (!canReach(target)) return;
    }
    startTransition(async () => {
      const res = await saveCreationProgress(character.id, data, target);
      if (res.error) return setError(res.error);
      setError(null);
      setStep(target);
    });
  }

  function saveAndExit() {
    startTransition(async () => {
      const res = await saveCreationProgress(character.id, data, step);
      if (res.error) return setError(res.error);
      onExit();
    });
  }

  function confirm() {
    startTransition(async () => {
      const saved = await saveCreationProgress(character.id, data, step);
      if (saved.error) return setError(saved.error);
      const res = await finalizeCharacter(character.id);
      if (res.error) {
        setError(res.error);
        if (res.invalidStep !== undefined) setStep(res.invalidStep);
        return;
      }
      onCreated();
    });
  }

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="font-serif text-xl text-accent">Creazione di {character.name}</h3>
        <button
          type="button"
          onClick={saveAndExit}
          disabled={pending}
          className="text-sm text-muted hover:text-accent"
        >
          Salva ed esci
        </button>
      </div>

      {/* Indicatore degli step: si puo' saltare a quelli gia' sbloccati */}
      <ol className="my-4 grid grid-cols-5 gap-1 text-center text-[11px] tracking-wide uppercase">
        {STEPS.map((label, i) => {
          const reachable = canReach(i);
          return (
            <li key={label}>
              <button
                type="button"
                disabled={!reachable || pending || i === step}
                onClick={() => goTo(i)}
                className={`w-full border-t-4 pt-2 transition ${
                  i === step
                    ? "border-accent font-bold text-foreground"
                    : reachable
                      ? "border-blood/70 text-muted hover:text-foreground"
                      : "border-border text-muted/50"
                }`}
              >
                <span className="block text-base">{i + 1}</span>
                <span className="hidden sm:block">{label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="min-h-64">
        {step === 0 && <StepIdentity data={data} update={update} />}
        {step === 1 && <StepOrigin data={data} update={update} />}
        {step === 2 && <StepAttributes data={data} update={update} />}
        {step === 3 && <StepStory data={data} update={update} />}
        {step === 4 && <StepSummary name={character.name} data={data} />}
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <div className="mt-5 flex justify-between gap-3 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => goTo(step - 1)}
          disabled={step === 0 || pending}
          className="btn-ghost disabled:invisible"
        >
          ← Indietro
        </button>
        {step < LAST ? (
          <button type="button" onClick={() => goTo(step + 1)} disabled={pending} className="btn">
            {pending ? "Salvataggio..." : "Avanti →"}
          </button>
        ) : (
          <button type="button" onClick={confirm} disabled={pending} className="btn tracking-widest uppercase">
            {pending ? "Creazione..." : "Conferma e crea PG"}
          </button>
        )}
      </div>
    </div>
  );
}

type StepProps = { data: CreationData; update: (patch: Partial<CreationData>) => void };

function Choice({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-md border px-4 py-3 text-left transition ${
        selected ? "border-accent bg-accent/15" : "border-border bg-background hover:border-accent/60"
      }`}
    >
      {children}
    </button>
  );
}

function StepIdentity({ data, update }: StepProps) {
  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-sm text-muted">Sesso</p>
        <div className="grid grid-cols-2 gap-3">
          {SEXES.map((s) => (
            <Choice key={s.id} selected={data.sex === s.id} onClick={() => update({ sex: s.id })}>
              {s.label}
            </Choice>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="mb-2 block text-sm text-muted">
          Età (da {AGE_MIN} a {AGE_MAX} anni)
        </span>
        <input
          type="number"
          min={AGE_MIN}
          max={AGE_MAX}
          value={data.age ?? ""}
          onChange={(e) => update({ age: e.target.value === "" ? undefined : Number(e.target.value) })}
          className="input w-32"
        />
      </label>
    </div>
  );
}

function StepOrigin({ data, update }: StepProps) {
  return (
    <div className="space-y-5">
      <label className="block">
        <span className="mb-2 block text-sm text-muted">Regione d&apos;origine</span>
        <select
          value={data.region ?? ""}
          onChange={(e) => update({ region: e.target.value || undefined })}
          className="input"
        >
          <option value="">— Scegli —</option>
          {REGIONS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <div>
        <p className="mb-2 text-sm text-muted">Ceto sociale</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {SOCIAL_CLASSES.map((c) => (
            <Choice
              key={c.id}
              selected={data.social_class === c.id}
              onClick={() => update({ social_class: c.id })}
            >
              <span className="block font-semibold">{c.label}</span>
              <span className="block text-xs text-muted">{c.description}</span>
            </Choice>
          ))}
        </div>
      </div>
    </div>
  );
}

function StepAttributes({ data, update }: StepProps) {
  const attributes = data.attributes ?? defaultAttributes();
  const left = ATTRIBUTE_POINTS - pointsSpent(attributes);

  const change = (id: string, delta: number) =>
    update({ attributes: { ...attributes, [id]: (attributes[id] ?? ATTRIBUTE_BASE) + delta } });

  return (
    <div>
      <p className="mb-4 text-sm text-muted">
        Ogni caratteristica parte da {ATTRIBUTE_BASE} e può arrivare a {ATTRIBUTE_MAX}. Distribuisci
        tutti i punti:{" "}
        <strong className={left === 0 ? "text-green-400" : "text-accent"}>
          {left} punt{left === 1 ? "o" : "i"} rimast{left === 1 ? "o" : "i"}
        </strong>
      </p>
      <ul className="space-y-2">
        {ATTRIBUTES.map((a) => {
          const value = attributes[a.id] ?? ATTRIBUTE_BASE;
          return (
            <li
              key={a.id}
              className="flex items-center justify-between rounded-md border border-border bg-background px-4 py-2"
            >
              <span>{a.label}</span>
              <span className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => change(a.id, -1)}
                  disabled={value <= ATTRIBUTE_BASE}
                  aria-label={`Togli un punto a ${a.label}`}
                  className="h-8 w-8 rounded border border-border text-lg hover:border-accent disabled:opacity-30"
                >
                  −
                </button>
                <strong className="w-6 text-center text-lg text-accent">{value}</strong>
                <button
                  type="button"
                  onClick={() => change(a.id, +1)}
                  disabled={value >= ATTRIBUTE_MAX || left <= 0}
                  aria-label={`Aggiungi un punto a ${a.label}`}
                  className="h-8 w-8 rounded border border-border text-lg hover:border-accent disabled:opacity-30"
                >
                  +
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StepStory({ data, update }: StepProps) {
  const appearance = data.appearance ?? "";
  const story = data.story ?? "";
  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1 flex justify-between text-sm text-muted">
          Aspetto fisico
          <Counter value={appearance} min={APPEARANCE_MIN} />
        </span>
        <textarea
          value={appearance}
          onChange={(e) => update({ appearance: e.target.value })}
          rows={4}
          maxLength={TEXT_MAX}
          placeholder="Corporatura, volto, segni particolari, abbigliamento..."
          className="input resize-none"
        />
      </label>
      <label className="block">
        <span className="mb-1 flex justify-between text-sm text-muted">
          Storia
          <Counter value={story} min={STORY_MIN} />
        </span>
        <textarea
          value={story}
          onChange={(e) => update({ story: e.target.value })}
          rows={8}
          maxLength={TEXT_MAX}
          placeholder="Da dove viene, cosa ha vissuto, cosa cerca..."
          className="input resize-none"
        />
      </label>
    </div>
  );
}

function Counter({ value, min }: { value: string; min: number }) {
  const length = value.trim().length;
  return (
    <span className={length >= min ? "text-green-400" : ""}>
      {length} / min. {min}
    </span>
  );
}

function StepSummary({ name, data }: { name: string; data: CreationData }) {
  const attributes = data.attributes ?? defaultAttributes();
  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted">
        Controlla le tue scelte. Puoi tornare a qualsiasi step per modificarle. Dopo la conferma il
        personaggio diventa attivo e potrà giocare nelle chat.
      </p>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
        <Item label="Nome" value={name} />
        <Item label="Sesso" value={labelOf(SEXES, data.sex)} />
        <Item label="Età" value={data.age ? `${data.age} anni` : "—"} />
        <Item label="Origine" value={labelOf(REGIONS, data.region)} />
        <Item label="Ceto" value={labelOf(SOCIAL_CLASSES, data.social_class)} />
      </dl>
      <div className="flex flex-wrap gap-2">
        {ATTRIBUTES.map((a) => (
          <span key={a.id} className="rounded border border-border px-2 py-1">
            {a.label} <strong className="text-accent">{attributes[a.id]}</strong>
          </span>
        ))}
      </div>
      <Item label="Aspetto" value={data.appearance ?? "—"} />
      <Item label="Storia" value={data.story ?? "—"} />
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted uppercase">{label}</dt>
      <dd className="whitespace-pre-line">{value}</dd>
    </div>
  );
}
