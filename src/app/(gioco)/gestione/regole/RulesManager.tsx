"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Skill, Trait, TraitModifier } from "@/lib/rules/catalog";
import { RULES, type StatId } from "@/lib/rules/config";
import type { StatDef } from "@/lib/rules/stats";
import { resetStatsCache } from "@/lib/rules/useStats";
import { createClient } from "@/lib/supabase/client";

const field = "mb-1 block text-xs tracking-wider text-muted uppercase";

// Gestione -> Abilita' e tratti: catalogo usato da schede, creazione e motore
export default function RulesManager({
  skills,
  traits,
  stats,
}: {
  skills: Skill[];
  traits: Trait[];
  stats: StatDef[]; // tutte, anche quelle disattivate
}) {
  const [tab, setTab] = useState<"statistiche" | "abilita" | "tratti">(
    "abilita",
  );
  return (
    <div>
      <div className="mb-5 flex gap-2">
        {(
          [
            ["statistiche", `Statistiche (${stats.length})`],
            ["abilita", `Abilità (${skills.length})`],
            ["tratti", `Vantaggi e svantaggi (${traits.length})`],
          ] as const
        ).map(([id, l]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`border px-4 py-2 text-sm tracking-wider uppercase ${
              tab === id
                ? "border-accent bg-blood/20 text-accent"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "abilita" ? (
        <SkillsEditor skills={skills} stats={stats} />
      ) : tab === "statistiche" ? (
        <StatsEditor stats={stats} skills={skills} />
      ) : (
        <TraitsEditor
          traits={traits}
          skills={skills}
          stats={stats.filter((x) => x.active)}
        />
      )}
    </div>
  );
}

function useSaver() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(
    fn: () => PromiseLike<{ error: { message: string; code?: string } | null }>,
    ok: string,
  ) {
    setBusy(true);
    setMsg(null);
    const { error } = await fn();
    setBusy(false);
    if (error)
      return (
        setMsg({
          ok: false,
          text:
            error.code === "23505"
              ? "Esiste già un elemento con questo nome."
              : error.message.length < 140
                ? error.message
                : "Salvataggio non riuscito.",
        }),
        false
      );
    setMsg({ ok: true, text: ok });
    router.refresh();
    return true;
  }
  return { supabase, busy, msg, run };
}

function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  return msg ? (
    <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>
      {msg.text}
    </p>
  ) : null;
}

// ---------------------------------------------------------------------
// Abilita'
// ---------------------------------------------------------------------
type SkillDraft = {
  id?: string;
  name: string;
  stat: StatId;
  description: string;
  sort_order: number;
  active: boolean;
};
const newSkill = (): SkillDraft => ({
  name: "",
  stat: "",
  description: "",
  sort_order: 0,
  active: true,
});

function SkillsEditor({
  skills,
  stats,
}: {
  skills: Skill[];
  stats: StatDef[];
}) {
  const { supabase, busy, msg, run } = useSaver();
  const [edit, setEdit] = useState<SkillDraft | null>(null);

  async function save() {
    if (!edit) return;
    const row = {
      ...edit,
      name: edit.name.trim(),
      description: edit.description.trim(),
    };
    const ok = await run(
      () =>
        row.id
          ? supabase.from("skills").update(row).eq("id", row.id)
          : supabase.from("skills").insert(row),
      "Abilità salvata.",
    );
    if (ok) setEdit(null);
  }

  async function remove(s: Skill) {
    if (
      !window.confirm(
        `Eliminare "${s.name}"? I PG perdono i livelli di questa abilità. Per toglierla senza perdere niente, disattivala.`,
      )
    )
      return;
    await run(
      () => supabase.from("skills").delete().eq("id", s.id),
      "Abilità eliminata.",
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Ogni abilità è collegata a una statistica: il tiro è{" "}
        <strong>statistica + abilità + d10</strong>. Un&apos;abilità disattivata
        non compare più nella creazione e nelle schede di chi non la possiede.
      </p>
      <Msg msg={msg} />
      {edit ? (
        <div className="space-y-3 border border-accent/40 bg-black/40 p-4">
          <div className="flex flex-wrap gap-3">
            <label className="block min-w-56 flex-1">
              <span className={field}>Nome</span>
              <input
                value={edit.name}
                maxLength={60}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                className="input py-1.5"
              />
            </label>
            <label className="block">
              <span className={field}>Statistica</span>
              <select
                value={edit.stat}
                onChange={(e) =>
                  setEdit({ ...edit, stat: e.target.value as StatId })
                }
                className="input w-48! py-1.5"
              >
                <option value="">Scegli...</option>
                {stats
                  .filter((s) => s.active || s.id === edit.stat)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} · {s.label}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block">
              <span className={field}>Ordine</span>
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
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input
                type="checkbox"
                checked={edit.active}
                onChange={(e) => setEdit({ ...edit, active: e.target.checked })}
              />
              Attiva
            </label>
          </div>
          <label className="block">
            <span className={field}>Descrizione (facoltativa)</span>
            <textarea
              value={edit.description}
              maxLength={1000}
              rows={2}
              onChange={(e) =>
                setEdit({ ...edit, description: e.target.value })
              }
              className="input resize-y text-sm"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || edit.name.trim().length < 2}
              onClick={save}
              className="btn px-4 py-1.5 text-sm"
            >
              Salva
            </button>
            <button
              type="button"
              onClick={() => setEdit(null)}
              className="btn-ghost px-4 py-1.5 text-sm"
            >
              Annulla
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEdit(newSkill())}
          className="btn px-4 py-1.5 text-sm"
        >
          + Nuova abilità
        </button>
      )}

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => (
          <section key={s.id} className="border border-border bg-black/30 p-3">
            <h3 className="mb-2 font-serif text-lg text-accent">
              {s.code} · {s.label}
            </h3>
            <ul className="space-y-1 text-sm">
              {skills
                .filter((k) => k.stat === s.id)
                .map((k) => (
                  <li
                    key={k.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span
                      className={k.active ? "" : "text-muted line-through"}
                      title={k.description || undefined}
                    >
                      {k.name}
                    </span>
                    <span className="flex shrink-0 gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setEdit({ ...k })}
                        className="text-muted hover:text-accent"
                      >
                        Modifica
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => remove(k)}
                        className="text-muted hover:text-red-400"
                      >
                        Elimina
                      </button>
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Vantaggi e svantaggi
// ---------------------------------------------------------------------
type TraitDraft = Omit<Trait, "id"> & { id?: string };
const newTrait = (): TraitDraft => ({
  name: "",
  kind: "vantaggio",
  cost: 1,
  effect: "",
  choice: "nessuna",
  unique_group: null,
  requires_master: false,
  modifiers: [],
  sort_order: 0,
  active: true,
});

const TARGETS: { id: TraitModifier["target"]; label: string }[] = [
  { id: "skill", label: "Un'abilità" },
  { id: "stat", label: "Una statistica" },
  { id: "choice_skill", label: "L'abilità scelta dal PG" },
  { id: "choice_stat", label: "La statistica scelta dal PG" },
  { id: "initiative", label: "Iniziativa" },
  { id: "hp", label: "Punti Ferita" },
  { id: "run", label: "Corsa (metri)" },
  { id: "other", label: "Altro (solo descrizione)" },
];

function TraitsEditor({
  traits,
  skills,
  stats,
}: {
  traits: Trait[];
  skills: Skill[];
  stats: StatDef[];
}) {
  const { supabase, busy, msg, run } = useSaver();
  const [edit, setEdit] = useState<TraitDraft | null>(null);

  async function save() {
    if (!edit) return;
    const row = {
      ...edit,
      name: edit.name.trim(),
      effect: edit.effect.trim(),
      unique_group: edit.unique_group?.trim() || null,
      modifiers: edit.modifiers.map((m) => ({
        ...m,
        condition: m.condition?.trim() || undefined,
      })),
    };
    const ok = await run(
      () =>
        row.id
          ? supabase.from("traits").update(row).eq("id", row.id)
          : supabase.from("traits").insert(row),
      "Tratto salvato.",
    );
    if (ok) setEdit(null);
  }

  async function remove(t: Trait) {
    if (
      !window.confirm(
        `Eliminare "${t.name}"? Viene tolto anche ai PG che lo hanno. Per non farlo più scegliere, disattivalo.`,
      )
    )
      return;
    await run(
      () => supabase.from("traits").delete().eq("id", t.id),
      "Tratto eliminato.",
    );
  }

  const setMod = (i: number, patch: Partial<TraitModifier>) =>
    edit &&
    setEdit({
      ...edit,
      modifiers: edit.modifiers.map((m, j) =>
        j === i ? { ...m, ...patch } : m,
      ),
    });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Alla creazione: {RULES.creation.advantagePoints} punti per i vantaggi,
        più il valore degli svantaggi presi (al massimo{" "}
        {RULES.creation.flawsMax} svantaggi per {RULES.creation.flawValueMax}{" "}
        punti, al massimo {RULES.creation.advantagesMax} vantaggi). Sui tiri, i
        modificatori dei tratti sommati restano tra −{RULES.traitCap} e +
        {RULES.traitCap}.
      </p>
      <Msg msg={msg} />
      {edit ? (
        <div className="space-y-3 border border-accent/40 bg-black/40 p-4">
          <div className="flex flex-wrap gap-3">
            <label className="block min-w-56 flex-1">
              <span className={field}>Nome</span>
              <input
                value={edit.name}
                maxLength={60}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                className="input py-1.5"
              />
            </label>
            <label className="block">
              <span className={field}>Tipo</span>
              <select
                value={edit.kind}
                onChange={(e) =>
                  setEdit({ ...edit, kind: e.target.value as Trait["kind"] })
                }
                className="input w-40! py-1.5"
              >
                <option value="vantaggio">Vantaggio</option>
                <option value="svantaggio">Svantaggio</option>
              </select>
            </label>
            <label className="block">
              <span className={field}>
                {edit.kind === "vantaggio" ? "Costo" : "Valore"}
              </span>
              <input
                type="number"
                min={1}
                max={10}
                value={edit.cost}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    cost: Math.min(
                      10,
                      Math.max(1, Math.trunc(Number(e.target.value)) || 1),
                    ),
                  })
                }
                className="input w-20! py-1.5"
              />
            </label>
            <label className="block">
              <span className={field}>Il PG sceglie</span>
              <select
                value={edit.choice}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    choice: e.target.value as Trait["choice"],
                  })
                }
                className="input w-44! py-1.5"
              >
                <option value="nessuna">Niente</option>
                <option value="abilita">Un&apos;abilità</option>
                <option value="statistica">Una statistica</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className={field}>Effetto (testo mostrato ai giocatori)</span>
            <textarea
              value={edit.effect}
              maxLength={1000}
              rows={2}
              onChange={(e) => setEdit({ ...edit, effect: e.target.value })}
              className="input resize-y text-sm"
            />
          </label>
          <div className="flex flex-wrap items-end gap-4">
            <label className="block">
              <span className={field}>Gruppo esclusivo (facoltativo)</span>
              <input
                value={edit.unique_group ?? ""}
                maxLength={40}
                placeholder="es. talento_statistica"
                onChange={(e) =>
                  setEdit({ ...edit, unique_group: e.target.value })
                }
                className="input w-56! py-1.5"
              />
            </label>
            <label className="block">
              <span className={field}>Ordine</span>
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
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={edit.requires_master}
                onChange={(e) =>
                  setEdit({ ...edit, requires_master: e.target.checked })
                }
              />
              Solo con il permesso del Master (non si sceglie alla creazione)
            </label>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={edit.active}
                onChange={(e) => setEdit({ ...edit, active: e.target.checked })}
              />
              Attivo
            </label>
          </div>

          <div>
            <p className={field}>
              Effetti sui tiri (li usa il motore delle regole)
            </p>
            <ul className="space-y-2">
              {edit.modifiers.map((m, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <select
                    value={m.target}
                    onChange={(e) =>
                      setMod(i, {
                        target: e.target.value as TraitModifier["target"],
                        skill: undefined,
                        stat: undefined,
                      })
                    }
                    className="input w-52! py-1"
                  >
                    {TARGETS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  {m.target === "skill" && (
                    <select
                      value={m.skill ?? ""}
                      onChange={(e) => setMod(i, { skill: e.target.value })}
                      className="input w-56! py-1"
                    >
                      <option value="">Quale abilità?</option>
                      {skills.map((k) => (
                        <option key={k.id} value={k.name}>
                          {k.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {m.target === "stat" && (
                    <select
                      value={m.stat ?? ""}
                      onChange={(e) =>
                        setMod(i, { stat: e.target.value as StatId })
                      }
                      className="input w-44! py-1"
                    >
                      <option value="">Quale statistica?</option>
                      {stats.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  )}
                  <input
                    type="number"
                    value={m.value}
                    onChange={(e) =>
                      setMod(i, {
                        value: Math.trunc(Number(e.target.value)) || 0,
                      })
                    }
                    className="input w-20! py-1 text-center"
                    aria-label="Valore"
                  />
                  <input
                    value={m.condition ?? ""}
                    placeholder="Solo quando... (facoltativo)"
                    maxLength={120}
                    onChange={(e) => setMod(i, { condition: e.target.value })}
                    className="input min-w-48 flex-1 py-1"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setEdit({
                        ...edit,
                        modifiers: edit.modifiers.filter((_, j) => j !== i),
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
                  modifiers: [
                    ...edit.modifiers,
                    {
                      target: "skill",
                      value: edit.kind === "vantaggio" ? 1 : -1,
                    },
                  ],
                })
              }
              className="mt-2 text-sm text-accent hover:underline"
            >
              + Aggiungi un effetto
            </button>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || edit.name.trim().length < 2}
              onClick={save}
              className="btn px-4 py-1.5 text-sm"
            >
              Salva
            </button>
            <button
              type="button"
              onClick={() => setEdit(null)}
              className="btn-ghost px-4 py-1.5 text-sm"
            >
              Annulla
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEdit(newTrait())}
          className="btn px-4 py-1.5 text-sm"
        >
          + Nuovo tratto
        </button>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        {(["vantaggio", "svantaggio"] as const).map((kind) => (
          <section key={kind} className="border border-border bg-black/30 p-3">
            <h3 className="mb-2 font-serif text-lg text-accent">
              {kind === "vantaggio" ? "Vantaggi" : "Svantaggi"}
            </h3>
            <ul className="space-y-2 text-sm">
              {traits
                .filter((t) => t.kind === kind)
                .map((t) => (
                  <li key={t.id} className="border-b border-border/40 pb-2">
                    <p className="flex items-baseline justify-between gap-2">
                      <span
                        className={
                          t.active ? "font-semibold" : "text-muted line-through"
                        }
                      >
                        {t.name}{" "}
                        <span className="text-xs font-normal text-muted">
                          ({t.cost})
                        </span>
                        {t.requires_master && (
                          <span className="ml-1 text-xs text-accent">
                            · Master
                          </span>
                        )}
                        {t.choice !== "nessuna" && (
                          <span className="ml-1 text-xs text-muted">
                            · sceglie{" "}
                            {t.choice === "abilita"
                              ? "un'abilità"
                              : "una statistica"}
                          </span>
                        )}
                      </span>
                      <span className="flex shrink-0 gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() =>
                            setEdit({ ...t, modifiers: t.modifiers ?? [] })
                          }
                          className="text-muted hover:text-accent"
                        >
                          Modifica
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => remove(t)}
                          className="text-muted hover:text-red-400"
                        >
                          Elimina
                        </button>
                      </span>
                    </p>
                    <p className="text-muted">{t.effect}</p>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Statistiche del personaggio
// ---------------------------------------------------------------------
type StatDraft = Omit<StatDef, "core"> & { core?: boolean; isNew?: boolean };
const newStat = (): StatDraft => ({
  id: "",
  code: "",
  label: "",
  description: "",
  sort_order: 0,
  active: true,
  isNew: true,
});

function StatsEditor({ stats, skills }: { stats: StatDef[]; skills: Skill[] }) {
  const { supabase, busy, msg, run } = useSaver();
  const [edit, setEdit] = useState<StatDraft | null>(null);

  async function save() {
    if (!edit) return;
    const code = edit.code.trim().toUpperCase();
    const row = {
      code,
      label: edit.label.trim(),
      description: edit.description.trim(),
      sort_order: edit.sort_order,
      active: edit.active,
    };
    const ok = await run(
      () =>
        edit.isNew
          ? supabase.from("stats").insert({ ...row, id: code.toLowerCase() })
          : supabase.from("stats").update(row).eq("id", edit.id),
      "Statistica salvata.",
    );
    if (ok) {
      resetStatsCache();
      setEdit(null);
    }
  }

  async function remove(st: StatDef) {
    const used = skills.filter((k) => k.stat === st.id).length;
    if (used)
      return window.alert(
        `"${st.label}" è collegata a ${used} abilità: collegale a un'altra statistica (o eliminale) prima di eliminarla.`,
      );
    if (
      !window.confirm(
        `Eliminare la statistica "${st.label}"? I valori dei PG restano salvati ma non si vedono più.`,
      )
    )
      return;
    const ok = await run(
      () => supabase.from("stats").delete().eq("id", st.id),
      "Statistica eliminata.",
    );
    if (ok) resetStatsCache();
  }

  const codeOk =
    !!edit && /^[A-Z][A-Z0-9]{1,5}$/.test(edit.code.trim().toUpperCase());

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Le statistiche si sommano ai tiri (in creazione si distribuiscono a
        punti; in gioco vanno da {RULES.statMin} a {RULES.statMax}). La{" "}
        <strong>sigla</strong> si usa anche nelle formule dei dadi (es. REF). Le
        6 di base servono alle statistiche derivate (HP, Corsa...): si possono
        rinominare ma non eliminare. Una statistica disattivata non compare più
        in scheda, creazione e dadi.
      </p>
      <Msg msg={msg} />
      {edit ? (
        <div className="space-y-3 border border-accent/40 bg-black/40 p-4">
          <div className="flex flex-wrap gap-3">
            <label className="block">
              <span className={field}>Sigla (2-6 lettere)</span>
              <input
                value={edit.code}
                maxLength={6}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    code: e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, ""),
                  })
                }
                className="input w-28! py-1.5 font-mono"
              />
            </label>
            <label className="block min-w-56 flex-1">
              <span className={field}>Nome</span>
              <input
                value={edit.label}
                maxLength={40}
                onChange={(e) => setEdit({ ...edit, label: e.target.value })}
                className="input py-1.5"
              />
            </label>
            <label className="block">
              <span className={field}>Ordine</span>
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
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input
                type="checkbox"
                checked={edit.active}
                onChange={(e) => setEdit({ ...edit, active: e.target.checked })}
              />
              Attiva
            </label>
          </div>
          <label className="block">
            <span className={field}>Descrizione</span>
            <input
              value={edit.description}
              maxLength={300}
              onChange={(e) =>
                setEdit({ ...edit, description: e.target.value })
              }
              className="input py-1.5"
            />
          </label>
          {!codeOk && edit.code && (
            <p className="text-xs text-red-400">
              La sigla va da 2 a 6 lettere o numeri e inizia con una lettera.
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !codeOk || !edit.label.trim()}
              onClick={save}
              className="btn px-4 py-1.5 text-sm"
            >
              Salva
            </button>
            <button
              type="button"
              onClick={() => setEdit(null)}
              className="btn-ghost px-4 py-1.5 text-sm"
            >
              Annulla
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEdit(newStat())}
          className="btn px-4 py-1.5 text-sm"
        >
          + Nuova statistica
        </button>
      )}

      <ul className="grid gap-2 md:grid-cols-2">
        {stats.map((st) => (
          <li
            key={st.id}
            className="flex items-start justify-between gap-3 border border-border bg-black/30 p-3"
          >
            <div className="min-w-0">
              <p
                className={
                  st.active
                    ? "font-serif text-lg text-accent"
                    : "font-serif text-lg text-muted line-through"
                }
              >
                <span className="font-mono">{st.code}</span> · {st.label}
                {st.core && (
                  <span className="ml-2 text-xs text-muted">· di base</span>
                )}
              </p>
              <p className="text-sm text-muted">{st.description}</p>
              <p className="text-xs text-muted">
                {skills.filter((k) => k.stat === st.id).length} abilità
                collegate
              </p>
            </div>
            <span className="flex shrink-0 gap-3 text-sm">
              <button
                type="button"
                onClick={() => setEdit({ ...st })}
                className="text-accent hover:underline"
              >
                Modifica
              </button>
              {!st.core && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(st)}
                  className="text-muted hover:text-red-400"
                >
                  Elimina
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
