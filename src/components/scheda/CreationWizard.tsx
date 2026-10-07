"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { finalizeCharacter, saveCreationProgress } from "@/app/scheda/actions";
import {
  ATTRIBUTES,
  SEXES,
  TEXT_MAX,
  labelOf,
  type CreationData,
  type CustomValue,
} from "@/lib/character-creation";
import {
  BLOCK_KINDS,
  PHYSICAL_FIELDS,
  cfg,
  customValueText,
  loadFlow,
  statPointsLeft,
  validateFlowStep,
  type CreationBlock,
  type CreationStep,
} from "@/lib/creation-flow";
import { MOONS, MOON_DAYS, formatBirth } from "@/lib/game-date";
import { loadCatalog, type Skill, type Trait } from "@/lib/rules/catalog";
import { createClient } from "@/lib/supabase/client";
import type { Character } from "@/lib/types";
import {
  DragonSummary,
  HouseSummary,
  StepDragon,
  StepHouse,
} from "./StepHouse";
import StepItems, { ChosenItems } from "./StepItems";
import {
  SkillsSummary,
  StepSkills,
  StepTraits,
  TraitsSummary,
} from "./StepRules";

type Props = {
  character: Pick<Character, "id" | "name" | "creation_step">;
  initialData: CreationData; // bozza salvata (la vede solo il proprietario)
  onExit: () => void;
  onCreated: () => void;
  // anteprima dal pannello di Gestione: niente salvataggi
  preview?: { steps: CreationStep[] };
};

// Procedura guidata: i passaggi e cosa chiedono arrivano da Gestione ->
// Creazione personaggio; l'ultimo passaggio e' sempre il riepilogo
export default function CreationWizard({
  character,
  initialData,
  onExit,
  onCreated,
  preview,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<CreationData>(initialData);
  const [flow, setFlow] = useState<CreationStep[] | null>(
    preview?.steps ?? null,
  );
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [traits, setTraits] = useState<Trait[] | null>(null);
  const [step, setStep] = useState(character.creation_step);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!preview) loadFlow(supabase).then(setFlow);
    loadCatalog(supabase).then((c) => {
      setSkills(c.skills);
      setTraits(c.traits);
    });
  }, [supabase, preview]);

  if (!flow)
    return <p className="p-5 text-center text-muted">Caricamento...</p>;

  const last = flow.length; // indice del riepilogo
  const current = Math.min(step, last);
  const ctx = {
    traits: traits ?? undefined,
    skillStats: skills
      ? Object.fromEntries(skills.map((k) => [k.id, k.stat as string]))
      : undefined,
  };
  const check = (i: number) => validateFlowStep(flow[i], data, ctx);
  const canReach = (target: number) =>
    target <= current ||
    Array.from({ length: target }, (_, i) => i).every((i) => !check(i));

  const update = (patch: Partial<CreationData>) => {
    setData((prev) => ({ ...prev, ...patch }));
    setError(null);
  };

  // Salva SEMPRE le scelte prima di cambiare passaggio, avanti o indietro
  function goTo(target: number) {
    if (target > current) {
      const stepError = check(current);
      if (stepError) return setError(stepError);
      if (!canReach(target)) return;
    }
    if (preview) return (setError(null), setStep(target));
    startTransition(async () => {
      const res = await saveCreationProgress(character.id, data, target);
      if (res.error) return setError(res.error);
      setError(null);
      setStep(target);
    });
  }

  function saveAndExit() {
    if (preview) return onExit();
    startTransition(async () => {
      const res = await saveCreationProgress(character.id, data, current);
      if (res.error) return setError(res.error);
      onExit();
    });
  }

  function confirm() {
    if (preview)
      return setError(
        "Questa è un'anteprima: il personaggio non viene creato.",
      );
    startTransition(async () => {
      const saved = await saveCreationProgress(character.id, data, current);
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

  const labels = [...flow.map((s) => s.title), "Riepilogo"];
  const step0 = flow[current];

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="font-serif text-xl text-accent">
          {preview
            ? "Anteprima della creazione"
            : `Creazione di ${character.name}`}
        </h3>
        <button
          type="button"
          onClick={saveAndExit}
          disabled={pending}
          className="text-sm text-muted hover:text-accent"
        >
          {preview ? "Chiudi" : "Salva ed esci"}
        </button>
      </div>

      {/* Indicatore dei passaggi: si puo' saltare a quelli gia' sbloccati */}
      <ol
        className="my-4 grid gap-1 text-center text-[0.6875rem] tracking-wide uppercase"
        style={{
          gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))`,
        }}
      >
        {labels.map((label, i) => {
          const reachable = canReach(i);
          return (
            <li key={`${i}-${label}`}>
              <button
                type="button"
                disabled={!reachable || pending || i === current}
                onClick={() => goTo(i)}
                className={`w-full border-t-4 pt-2 transition ${
                  i === current
                    ? "border-accent font-bold text-foreground"
                    : reachable
                      ? "border-blood/70 text-muted hover:text-foreground"
                      : "border-border text-muted/50"
                }`}
              >
                <span className="block text-base">{i + 1}</span>
                <span className="hidden truncate sm:block">{label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="min-h-64 space-y-6">
        {step0 ? (
          <>
            {step0.description && (
              <p className="text-sm whitespace-pre-line text-muted">
                {step0.description}
              </p>
            )}
            {step0.blocks.map((b) => (
              <BlockView
                key={b.id}
                block={b}
                data={data}
                update={update}
                skills={skills}
                traits={traits}
              />
            ))}
            {step0.blocks.length === 0 && (
              <p className="text-muted italic">Passaggio vuoto.</p>
            )}
          </>
        ) : (
          <Summary
            name={character.name}
            flow={flow}
            data={data}
            skills={skills}
            traits={traits}
          />
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <div className="mt-5 flex justify-between gap-3 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => goTo(current - 1)}
          disabled={current === 0 || pending}
          className="btn-ghost disabled:invisible"
        >
          ← Indietro
        </button>
        {current < last ? (
          <button
            type="button"
            onClick={() => goTo(current + 1)}
            disabled={pending}
            className="btn"
          >
            {pending ? "Salvataggio..." : "Avanti →"}
          </button>
        ) : (
          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            className="btn tracking-widest uppercase"
          >
            {pending ? "Creazione..." : "Conferma e crea PG"}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Un blocco della creazione
// ---------------------------------------------------------------------
type BlockProps = {
  block: CreationBlock;
  data: CreationData;
  update: (patch: Partial<CreationData>) => void;
  skills: Skill[] | null;
  traits: Trait[] | null;
};

function BlockFrame({
  title,
  help,
  children,
}: {
  title?: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <section>
      {title && (
        <h4 className="mb-1 font-serif text-lg text-accent">{title}</h4>
      )}
      {help && (
        <p className="mb-3 text-sm whitespace-pre-line text-muted">{help}</p>
      )}
      {children}
    </section>
  );
}

function BlockView({ block, data, update, skills, traits }: BlockProps) {
  const c = cfg(block);
  const title =
    c.label ||
    (block.kind === "testo" || block.kind === "campo"
      ? undefined
      : BLOCK_KINDS[block.kind].label);
  switch (block.kind) {
    case "sesso":
      return (
        <BlockFrame title={title} help={c.help}>
          <div className="grid grid-cols-2 gap-3">
            {SEXES.map((s) => (
              <Choice
                key={s.id}
                selected={data.sex === s.id}
                onClick={() => update({ sex: s.id })}
              >
                {s.label}
              </Choice>
            ))}
          </div>
        </BlockFrame>
      );
    case "eta":
      return (
        <BlockFrame
          title={title}
          help={c.help ?? `Da ${c.min} a ${c.max} anni.`}
        >
          <input
            type="number"
            min={c.min}
            max={c.max}
            value={data.age ?? ""}
            onChange={(e) =>
              update({
                age: e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
            className="input w-32"
          />
          {c.birthday && (
            <div className="mt-3">
              <span className="mb-1 block text-sm text-muted">
                Giorno e luna di nascita (al compleanno l&apos;età cresce di un anno)
              </span>
              <div className="flex gap-2">
                <select
                  value={data.birth_day ?? ""}
                  onChange={(e) =>
                    update({
                      birth_day: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    })
                  }
                  className="input w-24!"
                  aria-label="Giorno di nascita"
                >
                  <option value="">Giorno</option>
                  {Array.from(
                    {
                      length: data.birth_month
                        ? MOON_DAYS[data.birth_month - 1]
                        : 31,
                    },
                    (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {i + 1}
                      </option>
                    ),
                  )}
                </select>
                <select
                  value={data.birth_month ?? ""}
                  onChange={(e) =>
                    update({
                      birth_month: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    })
                  }
                  className="input w-52!"
                  aria-label="Luna di nascita"
                >
                  <option value="">Luna</option>
                  {MOONS.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </BlockFrame>
      );
    case "statistiche":
      return (
        <BlockFrame title={title} help={c.help}>
          <StatsBlock data={data} update={update} block={block} />
        </BlockFrame>
      );
    case "abilita":
      return (
        <BlockFrame title={title} help={c.help}>
          <StepSkills data={data} update={update} c={c} skills={skills} />
        </BlockFrame>
      );
    case "tratti":
      return (
        <BlockFrame title={title} help={c.help}>
          <StepTraits
            data={data}
            update={update}
            c={c}
            traits={traits}
            skills={skills ?? []}
          />
        </BlockFrame>
      );
    case "aspetto":
    case "storia": {
      const key = block.kind === "aspetto" ? "appearance" : "story";
      const value = data[key] ?? "";
      return (
        <BlockFrame help={c.help}>
          <label className="block">
            <span className="mb-1 flex justify-between text-sm text-muted">
              {title}
              <Counter value={value} min={c.min_chars ?? 0} />
            </span>
            <textarea
              value={value}
              onChange={(e) => update({ [key]: e.target.value })}
              rows={block.kind === "storia" ? 8 : 4}
              maxLength={TEXT_MAX}
              placeholder={c.placeholder}
              className="input resize-none"
            />
          </label>
          {block.kind === "storia" && (
            <p className="mt-1 text-xs text-muted">
              La storia la leggono solo la proprietaria e lo staff. Con la
              conferma del personaggio va in approvazione e non si modifica più,
              a meno che lo staff non la sblocchi.
            </p>
          )}
        </BlockFrame>
      );
    }
    case "dati_fisici":
      return (
        <BlockFrame
          title={title}
          help={
            c.help ??
            (c.required
              ? undefined
              : "Facoltativi: si possono completare anche dopo dalla scheda.")
          }
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {PHYSICAL_FIELDS.filter((f) => c.fields?.includes(f.id)).map((f) =>
              f.id === "visible_marks" ? (
                <label key={f.id} className="block sm:col-span-3">
                  <span className="mb-1 block text-sm text-muted">
                    {f.label}
                  </span>
                  <textarea
                    value={data[f.id] ?? ""}
                    onChange={(e) => update({ [f.id]: e.target.value })}
                    rows={2}
                    maxLength={f.max}
                    className="input resize-none"
                  />
                </label>
              ) : (
                <label key={f.id} className="block">
                  <span className="mb-1 block text-sm text-muted">
                    {f.label}
                  </span>
                  <input
                    value={data[f.id] ?? ""}
                    onChange={(e) => update({ [f.id]: e.target.value })}
                    maxLength={f.max}
                    className="input"
                  />
                </label>
              ),
            )}
          </div>
        </BlockFrame>
      );
    case "prestavolto":
      return (
        <BlockFrame title={title} help={c.help}>
          <FaceClaimBlock
            data={data}
            update={update}
            placeholder={c.placeholder}
          />
        </BlockFrame>
      );
    case "equipaggiamento":
      return (
        <BlockFrame title={title} help={c.help}>
          <StepItems
            chosen={data.items ?? []}
            onChange={(items) => update({ items })}
            budget={c.coins ?? 0}
          />
        </BlockFrame>
      );
    case "casata":
      return (
        <BlockFrame title={title} help={c.help}>
          <StepHouse data={data} update={update} />
        </BlockFrame>
      );
    case "drago":
      return (
        <BlockFrame title={title} help={c.help}>
          <StepDragon data={data} update={update} />
        </BlockFrame>
      );
    case "testo":
      return (
        <BlockFrame title={title}>
          <div className="guide-content text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {c.body ?? ""}
            </ReactMarkdown>
          </div>
        </BlockFrame>
      );
    case "campo":
      return <CustomField block={block} data={data} update={update} />;
  }
}

function StatsBlock({
  data,
  update,
  block,
}: {
  data: CreationData;
  update: BlockProps["update"];
  block: CreationBlock;
}) {
  const c = cfg(block);
  const attributes =
    data.attributes ??
    Object.fromEntries(ATTRIBUTES.map((a) => [a.id, c.min!]));
  const left = statPointsLeft({ ...data, attributes }, c);
  const change = (id: string, delta: number) =>
    update({
      attributes: { ...attributes, [id]: (attributes[id] ?? c.min!) + delta },
    });

  return (
    <div>
      <p className="mb-4 text-sm text-muted">
        Le statistiche si sommano a ogni tiro e dopo la creazione restano fisse.
        Ognuna va da {c.min} a {c.max}; in tutto fanno {c.points} punti.{" "}
        <strong className={left === 0 ? "text-green-400" : "text-accent"}>
          {left} punt{left === 1 ? "o" : "i"} rimast{left === 1 ? "o" : "i"}
        </strong>
      </p>
      <ul className="space-y-2">
        {ATTRIBUTES.map((a) => {
          const value = attributes[a.id] ?? c.min!;
          return (
            <li
              key={a.id}
              className="flex items-center justify-between rounded-md border border-border bg-background px-4 py-2"
            >
              <span>
                <strong className="text-accent">{a.code}</strong> {a.label}
                <span className="block text-xs text-muted">
                  {a.description}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => change(a.id, -1)}
                  disabled={value <= c.min!}
                  aria-label={`Togli un punto a ${a.label}`}
                  className="h-8 w-8 rounded border border-border text-lg hover:border-accent disabled:opacity-30"
                >
                  −
                </button>
                <strong className="w-6 text-center text-lg text-accent">
                  {value}
                </strong>
                <button
                  type="button"
                  onClick={() => change(a.id, +1)}
                  disabled={value >= c.max! || left <= 0}
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

function CustomField({
  block,
  data,
  update,
}: {
  block: CreationBlock;
  data: CreationData;
  update: BlockProps["update"];
}) {
  const c = cfg(block);
  const key = c.key ?? "";
  const value = data.custom?.[key];
  const set = (v: CustomValue | undefined) => {
    const next = { ...(data.custom ?? {}) };
    if (v === undefined || v === "") delete next[key];
    else next[key] = v;
    update({ custom: next });
  };
  const label = (
    <span className="mb-1 block text-sm text-muted">
      {c.label}
      {c.required && <span className="text-accent"> *</span>}
    </span>
  );

  let input: ReactNode;
  switch (c.type) {
    case "testo_lungo":
      input = (
        <textarea
          value={typeof value === "string" ? value : ""}
          onChange={(e) => set(e.target.value)}
          rows={4}
          maxLength={c.max_len ?? TEXT_MAX}
          className="input resize-none"
        />
      );
      break;
    case "numero":
      input = (
        <input
          type="number"
          min={c.min}
          max={c.max}
          value={typeof value === "number" ? value : ""}
          onChange={(e) =>
            set(e.target.value === "" ? undefined : Number(e.target.value))
          }
          className="input w-40"
        />
      );
      break;
    case "scelta":
      input = (
        <select
          value={typeof value === "string" ? value : ""}
          onChange={(e) => set(e.target.value || undefined)}
          className="input"
        >
          <option value="">Scegli...</option>
          {(c.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
      break;
    case "scelta_multipla": {
      const list = Array.isArray(value) ? value : [];
      input = (
        <div className="flex flex-wrap gap-2">
          {(c.options ?? []).map((o) => (
            <label
              key={o}
              className={`flex items-center gap-2 border px-3 py-1.5 text-sm ${list.includes(o) ? "border-accent bg-accent/10" : "border-border"}`}
            >
              <input
                type="checkbox"
                checked={list.includes(o)}
                onChange={() =>
                  set(
                    list.includes(o)
                      ? list.filter((x) => x !== o)
                      : [...list, o],
                  )
                }
              />
              {o}
            </label>
          ))}
        </div>
      );
      break;
    }
    case "si_no":
      input = (
        <div className="grid max-w-xs grid-cols-2 gap-3">
          {[true, false].map((v) => (
            <Choice
              key={String(v)}
              selected={value === v}
              onClick={() => set(v)}
            >
              {v ? "Sì" : "No"}
            </Choice>
          ))}
        </div>
      );
      break;
    default:
      input = (
        <input
          value={typeof value === "string" ? value : ""}
          onChange={(e) => set(e.target.value)}
          maxLength={c.max_len ?? 200}
          className="input"
        />
      );
  }

  return (
    <section>
      {label}
      {c.help && (
        <p className="mb-2 text-xs whitespace-pre-line text-muted">{c.help}</p>
      )}
      {input}
    </section>
  );
}

// Prestavolto: mentre si scrive controlla che non sia gia' di un altro PG
function FaceClaimBlock({
  data,
  update,
  placeholder,
}: {
  data: CreationData;
  update: BlockProps["update"];
  placeholder?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const claim = (data.face_claim ?? "").trim().replace(/\s+/g, " ");
  const [taken, setTaken] = useState<{ claim: string; by: boolean } | null>(
    null,
  );

  useEffect(() => {
    if (claim.length < 3) return;
    const t = setTimeout(() => {
      supabase
        .from("characters")
        .select("id")
        .ilike("face_claim", claim.replace(/[\\%_]/g, "\\$&"))
        .limit(1)
        .then(({ data: rows }) =>
          setTaken({ claim, by: (rows ?? []).length > 0 }),
        );
    }, 400);
    return () => clearTimeout(t);
  }, [supabase, claim]);
  const checked = taken?.claim === claim ? taken : null;

  return (
    <div>
      <input
        value={data.face_claim ?? ""}
        onChange={(e) => update({ face_claim: e.target.value })}
        maxLength={80}
        placeholder={placeholder}
        className="input"
      />
      {claim.length >= 3 && (
        <span
          className={`mt-1 block text-xs ${!checked ? "text-muted" : checked.by ? "text-red-400" : "text-green-400"}`}
        >
          {!checked
            ? "Controllo..."
            : checked.by
              ? "Questo prestavolto è già usato da un altro personaggio."
              : "Prestavolto libero."}
        </span>
      )}
      <span className="mt-1 block text-xs text-[#f0c75e]">
        Dopo la creazione il prestavolto non si può più cambiare.
      </span>
    </div>
  );
}

function Choice({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-md border px-4 py-3 text-left transition ${
        selected
          ? "border-accent bg-accent/15"
          : "border-border bg-background hover:border-accent/60"
      }`}
    >
      {children}
    </button>
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

// ---------------------------------------------------------------------
// Riepilogo: tutto quello che e' stato scelto, passaggio per passaggio
// ---------------------------------------------------------------------
function Summary({
  name,
  flow,
  data,
  skills,
  traits,
}: {
  name: string;
  flow: CreationStep[];
  data: CreationData;
  skills: Skill[] | null;
  traits: Trait[] | null;
}) {
  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted">
        Controlla le tue scelte. Puoi tornare a qualsiasi passaggio per
        modificarle. Dopo la conferma il personaggio diventa attivo e potrà
        giocare nelle chat.
      </p>
      <Item label="Nome" value={name} />
      {flow
        .flatMap((s) => s.blocks)
        .map((b) => {
          const c = cfg(b);
          switch (b.kind) {
            case "sesso":
              return (
                <Item
                  key={b.id}
                  label="Sesso"
                  value={labelOf(SEXES, data.sex)}
                />
              );
            case "eta":
              return (
                <Item
                  key={b.id}
                  label="Età"
                  value={
                    data.age
                      ? `${data.age} anni${data.birth_day && data.birth_month ? ` · nato il ${formatBirth(data.birth_day, data.birth_month)}` : ""}`
                      : "—"
                  }
                />
              );
            case "statistiche":
              return (
                <div key={b.id} className="flex flex-wrap gap-2">
                  {ATTRIBUTES.map((a) => (
                    <span
                      key={a.id}
                      className="rounded border border-border px-2 py-1"
                    >
                      {a.code}{" "}
                      <strong className="text-accent">
                        {data.attributes?.[a.id] ?? c.min}
                      </strong>
                    </span>
                  ))}
                </div>
              );
            case "abilita":
              return (
                <div key={b.id}>
                  <p className="text-xs text-muted uppercase">Abilità</p>
                  <SkillsSummary data={data} skills={skills} />
                </div>
              );
            case "tratti":
              return (
                <div key={b.id}>
                  <p className="text-xs text-muted uppercase">Tratti</p>
                  <TraitsSummary data={data} skills={skills} traits={traits} />
                </div>
              );
            case "aspetto":
              return (
                <Item
                  key={b.id}
                  label="Aspetto"
                  value={data.appearance ?? "—"}
                />
              );
            case "storia":
              return (
                <Item key={b.id} label="Storia" value={data.story ?? "—"} />
              );
            case "dati_fisici":
              return (
                <div
                  key={b.id}
                  className="grid grid-cols-2 gap-2 sm:grid-cols-4"
                >
                  {PHYSICAL_FIELDS.filter((f) => c.fields?.includes(f.id)).map(
                    (f) => (
                      <Item
                        key={f.id}
                        label={f.label}
                        value={data[f.id] || "—"}
                      />
                    ),
                  )}
                </div>
              );
            case "prestavolto":
              return (
                <Item
                  key={b.id}
                  label="Prestavolto"
                  value={data.face_claim || "—"}
                />
              );
            case "equipaggiamento":
              return <ChosenItems key={b.id} chosen={data.items ?? []} />;
            case "casata":
              return <HouseSummary key={b.id} data={data} />;
            case "drago":
              return <DragonSummary key={b.id} data={data} />;
            case "campo":
              return (
                <Item
                  key={b.id}
                  label={c.label ?? ""}
                  value={customValueText(c, data.custom?.[c.key ?? ""])}
                />
              );
            default:
              return null;
          }
        })}
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
