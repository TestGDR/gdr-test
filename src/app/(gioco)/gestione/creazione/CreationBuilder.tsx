"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import CreationWizard from "@/components/scheda/CreationWizard";
import Modal from "@/components/ui/Modal";
import {
  BLOCK_KINDS,
  FIELD_TYPES,
  PHYSICAL_FIELDS,
  VISIBILITY,
  cfg,
  defaultConfig,
  fieldKey,
  type BlockConfig,
  type BlockKind,
  type CreationBlock,
  type CreationStep,
  type FieldType,
  type FieldVisibility,
} from "@/lib/creation-flow";
import { createClient } from "@/lib/supabase/client";

const lbl = "mb-1 block text-xs tracking-wider text-muted uppercase";

// Gestione -> Creazione personaggio: passaggi, blocchi e loro impostazioni
export default function CreationBuilder({ steps }: { steps: CreationStep[] }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // id del blocco aperto
  const [preview, setPreview] = useState(false);

  const blocks = steps.flatMap((s) => s.blocks);
  const usedKinds = new Set(blocks.map((b) => b.kind));
  const fieldKeys = blocks
    .filter((b) => b.kind === "campo")
    .map((b) => cfg(b).key ?? "");

  async function run(
    fn: () =>
      | PromiseLike<{ error: { message: string; code?: string } | null }>[]
      | PromiseLike<{ error: { message: string; code?: string } | null }>,
    ok?: string,
  ) {
    setBusy(true);
    setMsg(null);
    const results = await Promise.all([fn()].flat());
    setBusy(false);
    const error = results.find((r) => r.error)?.error;
    if (error) {
      setMsg({
        ok: false,
        text:
          error.code === "23505"
            ? "Quel blocco c'è già nella creazione."
            : error.message.length < 140
              ? error.message
              : "Operazione non riuscita.",
      });
      return false;
    }
    if (ok) setMsg({ ok: true, text: ok });
    router.refresh();
    return true;
  }

  // ---- passaggi ----
  const addStep = () =>
    run(
      () =>
        supabase.from("creation_steps").insert({
          title: "Nuovo passaggio",
          sort_order: (steps.at(-1)?.sort_order ?? 0) + 1,
        }),
      "Passaggio aggiunto in fondo.",
    );

  const moveStep = (i: number, dir: -1 | 1) => {
    const a = steps[i];
    const b = steps[i + dir];
    if (!a || !b) return;
    return run(() => [
      supabase
        .from("creation_steps")
        .update({ sort_order: b.sort_order })
        .eq("id", a.id),
      supabase
        .from("creation_steps")
        .update({ sort_order: a.sort_order })
        .eq("id", b.id),
    ]);
  };

  const saveStep = (
    s: CreationStep,
    patch: { title?: string; description?: string },
  ) =>
    run(
      () => supabase.from("creation_steps").update(patch).eq("id", s.id),
      "Passaggio salvato.",
    );

  const deleteStep = (s: CreationStep) => {
    if (s.blocks.some((b) => BLOCK_KINDS[b.kind].required))
      return setMsg({
        ok: false,
        text: "Questo passaggio contiene Sesso o Età: spostali in un altro passaggio prima di eliminarlo.",
      });
    if (
      !window.confirm(`Eliminare il passaggio "${s.title}" e i suoi blocchi?`)
    )
      return;
    return run(
      () => supabase.from("creation_steps").delete().eq("id", s.id),
      "Passaggio eliminato.",
    );
  };

  // ---- blocchi ----
  const addBlock = (s: CreationStep, kind: BlockKind) => {
    const config: BlockConfig = defaultConfig(kind);
    if (kind === "campo") config.key = fieldKey("campo", fieldKeys);
    return run(
      () =>
        supabase
          .from("creation_blocks")
          .insert({
            step_id: s.id,
            kind,
            config,
            sort_order: (s.blocks.at(-1)?.sort_order ?? 0) + 1,
          })
          .select("id")
          .single()
          .then((r) => {
            if (r.data) setEditing(r.data.id as string);
            return r;
          }),
      `${BLOCK_KINDS[kind].label} aggiunto.`,
    );
  };

  const moveBlock = (s: CreationStep, i: number, dir: -1 | 1) => {
    const a = s.blocks[i];
    const b = s.blocks[i + dir];
    if (!a || !b) return;
    return run(() => [
      supabase
        .from("creation_blocks")
        .update({ sort_order: b.sort_order })
        .eq("id", a.id),
      supabase
        .from("creation_blocks")
        .update({ sort_order: a.sort_order })
        .eq("id", b.id),
    ]);
  };

  const moveBlockTo = (b: CreationBlock, stepId: string) => {
    const target = steps.find((s) => s.id === stepId);
    if (!target) return;
    return run(
      () =>
        supabase
          .from("creation_blocks")
          .update({
            step_id: target.id,
            sort_order: (target.blocks.at(-1)?.sort_order ?? 0) + 1,
          })
          .eq("id", b.id),
      `Spostato in "${target.title}".`,
    );
  };

  const saveBlock = (b: CreationBlock, config: BlockConfig) =>
    run(
      () => supabase.from("creation_blocks").update({ config }).eq("id", b.id),
      "Blocco salvato.",
    ).then((ok) => ok && setEditing(null));

  const deleteBlock = (b: CreationBlock) => {
    if (BLOCK_KINDS[b.kind].required) return;
    const extra =
      b.kind === "campo"
        ? " I valori già inseriti dai PG restano salvati ma non si vedono più."
        : "";
    if (
      !window.confirm(
        `Eliminare il blocco "${cfg(b).label || BLOCK_KINDS[b.kind].label}"?${extra}`,
      )
    )
      return;
    return run(
      () => supabase.from("creation_blocks").delete().eq("id", b.id),
      "Blocco eliminato.",
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={addStep}
          className="btn px-4 py-1.5 text-sm"
        >
          + Nuovo passaggio
        </button>
        <button
          type="button"
          onClick={() => setPreview(true)}
          className="btn-ghost px-4 py-1.5 text-sm"
        >
          Anteprima della creazione
        </button>
        {msg && (
          <span
            className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}
          >
            {msg.text}
          </span>
        )}
      </div>

      <ol className="space-y-4">
        {steps.map((s, i) => (
          <li key={s.id} className="border border-border bg-black/40">
            <StepHeader
              step={s}
              index={i}
              count={steps.length}
              busy={busy}
              onMove={(d) => moveStep(i, d)}
              onSave={(patch) => saveStep(s, patch)}
              onDelete={() => deleteStep(s)}
            />
            <ul className="divide-y divide-border/50">
              {s.blocks.map((b, j) => (
                <li key={b.id} className="px-4 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold">
                        {BLOCK_KINDS[b.kind].label}
                      </span>
                      <span className="ml-2 text-sm text-muted">
                        {blockSummary(b)}
                      </span>
                    </span>
                    <IconBtn
                      disabled={busy || j === 0}
                      onClick={() => moveBlock(s, j, -1)}
                      label="Su"
                    >
                      ↑
                    </IconBtn>
                    <IconBtn
                      disabled={busy || j === s.blocks.length - 1}
                      onClick={() => moveBlock(s, j, 1)}
                      label="Giù"
                    >
                      ↓
                    </IconBtn>
                    {steps.length > 1 && (
                      <select
                        value=""
                        disabled={busy}
                        onChange={(e) =>
                          e.target.value && moveBlockTo(b, e.target.value)
                        }
                        className="input w-40! py-0.5 text-xs"
                        aria-label="Sposta in un altro passaggio"
                      >
                        <option value="">Sposta in...</option>
                        {steps
                          .filter((x) => x.id !== s.id)
                          .map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.title}
                            </option>
                          ))}
                      </select>
                    )}
                    {b.kind !== "sesso" && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditing(editing === b.id ? null : b.id)
                        }
                        className="text-sm text-accent hover:underline"
                      >
                        {editing === b.id ? "Chiudi" : "Modifica"}
                      </button>
                    )}
                    {!BLOCK_KINDS[b.kind].required && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => deleteBlock(b)}
                        className="text-sm text-muted hover:text-red-400"
                      >
                        Elimina
                      </button>
                    )}
                  </div>
                  {editing === b.id && (
                    <BlockEditor
                      block={b}
                      busy={busy}
                      onSave={(c) => saveBlock(b, c)}
                    />
                  )}
                </li>
              ))}
              {s.blocks.length === 0 && (
                <li className="px-4 py-3 text-sm text-muted italic">
                  Nessun blocco: aggiungine uno.
                </li>
              )}
            </ul>
            <div className="border-t border-border/50 px-4 py-2">
              <select
                value=""
                disabled={busy}
                onChange={(e) =>
                  e.target.value && addBlock(s, e.target.value as BlockKind)
                }
                className="input w-72! py-1 text-sm"
              >
                <option value="">+ Aggiungi a questo passaggio...</option>
                {(Object.keys(BLOCK_KINDS) as BlockKind[])
                  .filter((k) => !BLOCK_KINDS[k].unique || !usedKinds.has(k))
                  .map((k) => (
                    <option
                      key={k}
                      value={k}
                      title={BLOCK_KINDS[k].description}
                    >
                      {BLOCK_KINDS[k].label}
                    </option>
                  ))}
              </select>
            </div>
          </li>
        ))}
        <li className="border border-dashed border-border px-4 py-3 text-sm text-muted">
          <span className="font-serif text-lg text-foreground">
            {steps.length + 1}. Riepilogo
          </span>{" "}
          — sempre l&apos;ultimo passaggio: mostra tutte le scelte e il pulsante
          &quot;Conferma e crea PG&quot;.
        </li>
      </ol>

      <Modal
        open={preview}
        onClose={() => setPreview(false)}
        title="Anteprima della creazione"
        size="lg"
      >
        {preview && (
          <CreationWizard
            character={{
              id: "anteprima",
              name: "Personaggio di prova",
              creation_step: 0,
            }}
            initialData={{}}
            onExit={() => setPreview(false)}
            onCreated={() => setPreview(false)}
            preview={{ steps }}
          />
        )}
      </Modal>
    </div>
  );
}

function IconBtn({
  children,
  label,
  ...p
}: {
  children: React.ReactNode;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      {...p}
      className="h-7 w-7 border border-border text-sm hover:border-accent disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function StepHeader({
  step,
  index,
  count,
  busy,
  onMove,
  onSave,
  onDelete,
}: {
  step: CreationStep;
  index: number;
  count: number;
  busy: boolean;
  onMove: (dir: -1 | 1) => void;
  onSave: (patch: { title: string; description: string }) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(step.title);
  const [description, setDescription] = useState(step.description);
  const dirty = title !== step.title || description !== step.description;
  return (
    <div className="space-y-2 border-b border-border bg-blood/10 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-serif text-lg text-accent">{index + 1}.</span>
        <input
          value={title}
          maxLength={60}
          onChange={(e) => setTitle(e.target.value)}
          className="input min-w-48 flex-1 py-1 font-serif"
          aria-label="Titolo del passaggio"
        />
        <IconBtn
          disabled={busy || index === 0}
          onClick={() => onMove(-1)}
          label="Sposta prima"
        >
          ↑
        </IconBtn>
        <IconBtn
          disabled={busy || index === count - 1}
          onClick={() => onMove(1)}
          label="Sposta dopo"
        >
          ↓
        </IconBtn>
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="text-sm text-muted hover:text-red-400"
        >
          Elimina passaggio
        </button>
      </div>
      <textarea
        value={description}
        maxLength={2000}
        rows={2}
        placeholder="Spiegazione mostrata in cima al passaggio (facoltativa)"
        onChange={(e) => setDescription(e.target.value)}
        className="input resize-y text-sm"
      />
      {dirty && (
        <button
          type="button"
          disabled={busy || !title.trim()}
          onClick={() =>
            onSave({ title: title.trim(), description: description.trim() })
          }
          className="btn px-3 py-1 text-xs"
        >
          Salva titolo e spiegazione
        </button>
      )}
    </div>
  );
}

// Breve descrizione delle impostazioni di un blocco
function blockSummary(b: CreationBlock) {
  const c = cfg(b);
  switch (b.kind) {
    case "eta":
      return `da ${c.min} a ${c.max} anni`;
    case "statistiche":
      return `${c.points} punti, da ${c.min} a ${c.max}`;
    case "abilita":
      return `punti = età + ${c.age_bonus ?? 0}; ogni abilità fino al valore della sua statistica (massimo 8 alla creazione)`;
    case "tratti":
      return `${c.advantage_points} punti vantaggi, max ${c.flaws_max} svantaggi (${c.flaw_value_max} punti), max ${c.advantages_max} vantaggi`;
    case "aspetto":
    case "storia":
      return `almeno ${c.min_chars} caratteri`;
    case "prestavolto":
    case "casata":
      return c.required ? "obbligatorio" : "facoltativo";
    case "drago":
      return "facoltativo, uno solo";
    case "equipaggiamento":
      return `${c.coins ?? 0} monete${c.keep_change ? ", le avanzate restano al PG" : ", le avanzate si perdono"}`;
    case "dati_fisici":
      return `${
        PHYSICAL_FIELDS.filter((f) => c.fields?.includes(f.id))
          .map((f) => f.label)
          .join(", ") || "nessun campo"
      }${c.required ? " (obbligatori)" : ""}`;
    case "testo":
      return (c.label || c.body || "").slice(0, 60);
    case "campo":
      return `"${c.label}" · ${FIELD_TYPES[c.type ?? "testo"]}${c.required ? " · obbligatorio" : ""} · ${c.visibility}`;
    default:
      return "";
  }
}

// ---------------------------------------------------------------------
// Impostazioni di un blocco
// ---------------------------------------------------------------------
function BlockEditor({
  block,
  busy,
  onSave,
}: {
  block: CreationBlock;
  busy: boolean;
  onSave: (c: BlockConfig) => void;
}) {
  const [c, setC] = useState<BlockConfig>(cfg(block));
  const set = (patch: Partial<BlockConfig>) =>
    setC((x) => ({ ...x, ...patch }));
  const num = (k: keyof BlockConfig, label: string, min = 0, max = 1000) => (
    <label className="block">
      <span className={lbl}>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={(c[k] as number | undefined) ?? ""}
        // mentre si scrive il numero resta com'e' (per scrivere 33 si passa da 3);
        // i limiti si applicano quando si esce dal campo
        onChange={(e) =>
          set({
            [k]:
              e.target.value === ""
                ? undefined
                : Math.trunc(Number(e.target.value)) || 0,
          })
        }
        onBlur={() => {
          const v = c[k] as number | undefined;
          if (v !== undefined) set({ [k]: Math.min(max, Math.max(min, v)) });
        }}
        className="input w-28! py-1"
      />
    </label>
  );

  return (
    <div className="mt-3 space-y-3 border border-accent/30 bg-black/40 p-3">
      <p className="text-xs text-muted">
        {BLOCK_KINDS[block.kind].description}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={lbl}>
            {block.kind === "campo" ? "Nome del campo" : "Titolo (facoltativo)"}
          </span>
          <input
            value={c.label ?? ""}
            maxLength={80}
            onChange={(e) => set({ label: e.target.value })}
            className="input py-1"
          />
        </label>
        {block.kind !== "testo" && (
          <label className="block">
            <span className={lbl}>Spiegazione (facoltativa)</span>
            <input
              value={c.help ?? ""}
              maxLength={500}
              onChange={(e) => set({ help: e.target.value })}
              className="input py-1"
            />
          </label>
        )}
      </div>

      {block.kind === "eta" && (
        <div className="flex gap-3">
          {num("min", "Età minima", 1, 200)}
          {num("max", "Età massima", 1, 200)}
        </div>
      )}
      {block.kind === "statistiche" && (
        <div className="flex flex-wrap gap-3">
          {num("points", "Punti totali (somma delle 6)", 6, 60)}
          {num("min", "Minimo per statistica", 1, 10)}
          {num("max", "Massimo per statistica", 1, 10)}
        </div>
      )}
      {block.kind === "abilita" && (
        <div className="flex gap-3">
          {num("age_bonus", "Punti = età + ...", 0, 300)}
        </div>
      )}
      {block.kind === "tratti" && (
        <div className="flex flex-wrap gap-3">
          {num("advantage_points", "Punti vantaggi", 0, 30)}
          {num("flaws_max", "Max svantaggi", 0, 10)}
          {num("flaw_value_max", "Max valore svantaggi", 0, 30)}
          {num("advantages_max", "Max vantaggi", 0, 20)}
        </div>
      )}
      {(block.kind === "aspetto" || block.kind === "storia") && (
        <div className="flex flex-wrap gap-3">
          {num("min_chars", "Caratteri minimi", 0, 4000)}
          <label className="block min-w-64 flex-1">
            <span className={lbl}>Testo di esempio nel riquadro</span>
            <input
              value={c.placeholder ?? ""}
              maxLength={200}
              onChange={(e) => set({ placeholder: e.target.value })}
              className="input py-1"
            />
          </label>
        </div>
      )}
      {block.kind === "casata" && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!c.required}
            onChange={(e) => set({ required: e.target.checked })}
          />
          Obbligatorio (senza, il PG può nascere senza casata)
        </label>
      )}
      {block.kind === "equipaggiamento" && (
        <div className="flex flex-wrap items-end gap-4 text-sm">
          {num("coins", "Monete per comprare l'equipaggiamento", 0, 100000)}
          <label className="flex items-center gap-2 pb-2">
            <input
              type="checkbox"
              checked={!!c.keep_change}
              onChange={(e) => set({ keep_change: e.target.checked })}
            />
            Le monete avanzate restano al PG
          </label>
          <p className="w-full text-xs text-muted">
            Gli oggetti e i loro prezzi si decidono in Gestione → Oggetti
            (&quot;disponibile all&apos;iscrizione&quot;); senza prezzo un
            oggetto è gratis.
          </p>
        </div>
      )}
      {block.kind === "prestavolto" && (
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="block min-w-64 flex-1">
            <span className={lbl}>Testo di esempio nel riquadro</span>
            <input
              value={c.placeholder ?? ""}
              maxLength={200}
              onChange={(e) => set({ placeholder: e.target.value })}
              className="input py-1"
            />
          </label>
          <label className="flex items-center gap-2 self-end pb-2">
            <input
              type="checkbox"
              checked={!!c.required}
              onChange={(e) => set({ required: e.target.checked })}
            />
            Obbligatorio
          </label>
        </div>
      )}
      {block.kind === "dati_fisici" && (
        <div className="flex flex-wrap gap-4 text-sm">
          {PHYSICAL_FIELDS.map((f) => (
            <label key={f.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={c.fields?.includes(f.id) ?? false}
                onChange={(e) =>
                  set({
                    fields: e.target.checked
                      ? [...(c.fields ?? []), f.id]
                      : (c.fields ?? []).filter((x) => x !== f.id),
                  })
                }
              />
              {f.label}
            </label>
          ))}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!c.required}
              onChange={(e) => set({ required: e.target.checked })}
            />
            Obbligatori
          </label>
        </div>
      )}
      {block.kind === "testo" && (
        <label className="block">
          <span className={lbl}>
            Testo (si può usare **grassetto**, *corsivo*, elenchi con -)
          </span>
          <textarea
            value={c.body ?? ""}
            maxLength={6000}
            rows={6}
            onChange={(e) => set({ body: e.target.value })}
            className="input resize-y text-sm"
          />
        </label>
      )}
      {block.kind === "campo" && (
        <>
          <div className="flex flex-wrap gap-3">
            <label className="block">
              <span className={lbl}>Tipo</span>
              <select
                value={c.type}
                onChange={(e) => set({ type: e.target.value as FieldType })}
                className="input w-56! py-1"
              >
                {(Object.keys(FIELD_TYPES) as FieldType[]).map((t) => (
                  <option key={t} value={t}>
                    {FIELD_TYPES[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-64 flex-1">
              <span className={lbl}>Chi lo vede nella scheda</span>
              <select
                value={c.visibility}
                onChange={(e) =>
                  set({ visibility: e.target.value as FieldVisibility })
                }
                className="input py-1"
              >
                {(Object.keys(VISIBILITY) as FieldVisibility[]).map((v) => (
                  <option key={v} value={v}>
                    {VISIBILITY[v]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 self-end pb-1 text-sm">
              <input
                type="checkbox"
                checked={!!c.required}
                onChange={(e) => set({ required: e.target.checked })}
              />
              Obbligatorio
            </label>
          </div>
          <div className="flex flex-wrap gap-3">
            {(c.type === "testo" || c.type === "testo_lungo") &&
              num("max_len", "Caratteri massimi", 1, 4000)}
            {c.type === "numero" && (
              <>
                {num("min", "Minimo", -100000, 100000)}
                {num("max", "Massimo", -100000, 100000)}
              </>
            )}
            {c.type === "scelta_multipla" &&
              num("max_choices", "Scelte massime (0 = nessun limite)", 0, 50)}
          </div>
          {(c.type === "scelta" || c.type === "scelta_multipla") && (
            <label className="block">
              <span className={lbl}>Opzioni (una per riga)</span>
              <textarea
                value={(c.options ?? []).join("\n")}
                rows={4}
                onChange={(e) =>
                  set({
                    options: e.target.value
                      .split("\n")
                      .map((x) => x.slice(0, 100))
                      .slice(0, 50),
                  })
                }
                className="input resize-y text-sm"
              />
            </label>
          )}
          <p className="text-xs text-muted">
            Codice interno del campo: {c.key} (non cambia, così i valori già
            salvati restano).
          </p>
        </>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={() =>
          onSave({
            ...c,
            options: c.options?.map((x) => x.trim()).filter(Boolean),
            label: c.label?.trim() || undefined,
            help: c.help?.trim() || undefined,
          })
        }
        className="btn px-4 py-1.5 text-sm"
      >
        Salva blocco
      </button>
    </div>
  );
}
