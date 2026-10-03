"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { DragonPortrait } from "@/components/draghi/DragonCard";
import { saveDragonImage } from "@/components/draghi/actions";
import {
  DRAGON_COLORS,
  MAX_VALUE,
  STATS,
  dragonName,
  monthlyUpkeep,
  stageLabel,
  type Dragon,
  type DragonStage,
  type TraitPair,
} from "@/lib/dragons";
import { invalidateDragonSkills, type DragonSkill } from "@/lib/dragon-skills";
import { createClient } from "@/lib/supabase/client";

export type HouseLite = { id: string; name: string; sigil_url: string | null };
export type PgLite = { id: string; name: string; house_id: string | null; px: number; status: string };

type Props = {
  houses: HouseLite[];
  dragons: Dragon[];
  stages: DragonStage[];
  traits: TraitRow[];
  pgs: PgLite[];
  skills: DragonSkill[];
  temperaments: TemperamentRow[];
};

const TABS = [
  { id: "draghi", label: "Draghi" },
  { id: "fasi", label: "Fasi e costi" },
  { id: "abilita", label: "Abilità" },
  { id: "tratti", label: "Pregi e difetti" },
  { id: "caratteri", label: "Caratteri" },
] as const;
type Tab = (typeof TABS)[number]["id"];

// Esegue un'operazione sul database, mostra l'esito e ricarica i dati della pagina
function useOp() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(op: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setBusy(true);
    setMsg(null);
    const { error } = await op();
    setBusy(false);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: ok });
    if (!error) router.refresh();
    return !error;
  }
  const feedback = msg && <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>;
  return { supabase, run, busy, feedback };
}

export default function DragonsManager(props: Props) {
  const [tab, setTab] = useState<Tab>("draghi");
  return (
    <section className="border border-border bg-black/50">
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-border px-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-xs tracking-[0.12em] uppercase transition ${
              tab === t.id ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-4">
        {tab === "draghi" && <DragonsTab {...props} />}
        {tab === "fasi" && <StagesTab stages={props.stages} />}
        {tab === "abilita" && <SkillsTab skills={props.skills} />}
        {tab === "tratti" && <TraitsTab traits={props.traits} />}
        {tab === "caratteri" && <TemperamentsTab temperaments={props.temperaments} />}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------
// Draghi per casata
// ---------------------------------------------------------------------
function DragonsTab({ houses, dragons, stages, traits, pgs, skills, temperaments }: Props) {
  const { supabase, run, busy, feedback } = useOp();
  const [selectedId, setSelectedId] = useState<string | null>(dragons[0]?.id ?? null);
  const [newStage, setNewStage] = useState<Record<string, string>>({});
  const selected = dragons.find((d) => d.id === selectedId) ?? null;
  const pgName = (id: string | null) => pgs.find((p) => p.id === id)?.name ?? null;
  const groups = [
    ...houses.map((h) => ({ id: h.id, name: `Casata ${h.name}`, house: h as HouseLite | null })),
    { id: "nessuna", name: "Senza casata", house: null },
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
      <aside className="space-y-4">
        {feedback}
        {groups.map((g) => {
          const list = dragons.filter((d) => (d.house_id ?? null) === (g.house?.id ?? null));
          if (!g.house && list.length === 0) return null;
          const hid = g.house?.id;
          return (
            <div key={g.id} className="border border-border/70">
              <div className="flex items-center gap-2 border-b border-border/70 bg-black/40 px-3 py-2">
                {g.house?.sigil_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={g.house.sigil_url} alt="" className="h-6 w-6 object-contain" />
                )}
                <span className="flex-1 font-serif">{g.name}</span>
                <span className="text-xs text-muted">{list.length}</span>
              </div>
              <ul>
                {list.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(d.id)}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${d.id === selectedId ? "bg-blood/30" : "hover:bg-blood/15"}`}
                    >
                      <DragonPortrait dragon={d} size="h-8 w-8" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-serif">{dragonName(d)}</span>
                        <span className="text-xs text-muted">
                          {d.status === "uovo" ? "Uovo" : stageLabel(d.stage, stages)}
                          {d.rider_id && ` · ${pgName(d.rider_id)}`}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
                {list.length === 0 && <li className="px-3 py-2 text-xs text-muted">Nessun drago.</li>}
              </ul>
              {hid && (
                <div className="flex flex-wrap items-center gap-1.5 border-t border-border/70 p-2 text-xs">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      (list.length === 0 ||
                        window.confirm(`${g.name} ha già ${list.length} tra draghi e uova. Assegnare comunque la dotazione iniziale?`)) &&
                      run(() => supabase.rpc("staff_give_starter", { p_house: hid }), "Dotazione assegnata: 1 drago adolescente e 2 uova.")
                    }
                    className="btn px-2 py-1 text-xs"
                  >
                    Dotazione iniziale
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(() => supabase.rpc("staff_add_dragon", { p_house: hid, p_stage: null }), "Nuovo uovo aggiunto.")}
                    className="btn-ghost px-2 py-1 text-xs"
                  >
                    + Uovo
                  </button>
                  <select
                    value={newStage[hid] ?? "neonato"}
                    onChange={(e) => setNewStage((s) => ({ ...s, [hid]: e.target.value }))}
                    aria-label="Fase del nuovo drago"
                    className="input w-auto py-1 text-xs"
                  >
                    {stages.map((s) => (
                      <option key={s.stage} value={s.stage}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => supabase.rpc("staff_add_dragon", { p_house: hid, p_stage: newStage[hid] ?? "neonato" }),
                        "Nuovo drago generato a caso.",
                      )
                    }
                    className="btn-ghost px-2 py-1 text-xs"
                  >
                    + Drago
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </aside>

      {selected ? (
        <DragonEditor key={selected.id + selected.stage + selected.status} dragon={selected} {...{ houses, dragons, stages, traits, pgs, skills, temperaments }} onDeleted={() => setSelectedId(null)} />
      ) : (
        <p className="text-muted">Scegli un drago dall&apos;elenco, oppure assegna la dotazione iniziale a una casata.</p>
      )}
    </div>
  );
}

function DragonEditor({
  dragon,
  houses,
  dragons,
  stages,
  traits,
  pgs,
  skills,
  onDeleted,
}: Props & { dragon: Dragon; onDeleted: () => void }) {
  const { supabase, run, busy, feedback } = useOp();
  const [d, setD] = useState<Dragon>(dragon);
  const set = <K extends keyof Dragon>(k: K, v: Dragon[K]) => setD((prev) => ({ ...prev, [k]: v }));
  const egg = d.status === "uovo";
  // un PG puo' cavalcare un solo drago
  const takenRiders = new Set(dragons.filter((x) => x.id !== d.id && x.rider_id).map((x) => x.rider_id));

  function save() {
    run(
      () =>
        supabase
          .from("dragons")
          .update({
            name: d.name.trim(),
            house_id: d.house_id,
            rider_id: d.rider_id,
            ...(egg
              ? {}
              : {
                  stage: d.stage,
                  sex: d.sex,
                  color1: d.color1,
                  color2: d.color2 || null,
                  pregi: d.pregi,
                  difetti: d.difetti,
                  temperament: d.temperament,
                  stats: d.stats,
                  skills: d.skills,
                  unspent_points: d.unspent_points,
                }),
          })
          .eq("id", d.id),
      "Drago salvato.",
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-4">
        <DragonPortrait dragon={{ ...d, image_url: dragon.image_url }} />
        <div className="min-w-0 flex-1 space-y-2">
          <h2 className="font-serif text-2xl text-accent">{dragonName(d)}</h2>
          <p className="text-sm text-muted">
            {egg ? "Uovo" : `${stageLabel(d.stage, stages)} · mantenimento ${monthlyUpkeep(d, stages)} risorse al mese`}
          </p>
          <ImageUpload dragonId={d.id} hasImage={!!dragon.image_url} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Nome">
          <input value={d.name} onChange={(e) => set("name", e.target.value)} maxLength={60} className="input" />
        </Field>
        <Field label="Casata">
          <select value={d.house_id ?? ""} onChange={(e) => set("house_id", e.target.value || null)} className="input">
            <option value="">Nessuna</option>
            {houses.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </Field>
        {!egg && (
          <Field label="Cavaliere">
            <select value={d.rider_id ?? ""} onChange={(e) => set("rider_id", e.target.value || null)} className="input">
              <option value="">Nessuno</option>
              {pgs
                .filter((p) => p.status === "attivo" && (!takenRiders.has(p.id) || p.id === d.rider_id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.house_id !== d.house_id ? " (altra casata)" : ""}
                  </option>
                ))}
            </select>
          </Field>
        )}
      </div>

      {egg ? (
        <div className="flex flex-wrap items-center gap-3 border border-border/70 p-3 text-sm">
          <span className="text-muted">
            È ancora un uovo: alla schiusa vengono estratti a caso caratteristiche, abilità, pregi, difetto, colore, sesso e carattere.
            I membri della casata possono schiuderlo dalla loro scheda.
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              window.confirm("Schiudere ora l'uovo?") && run(() => supabase.rpc("hatch_egg", { p_dragon: d.id }), "L'uovo si è schiuso.")
            }
            className="btn px-3 py-1.5 text-sm"
          >
            Schiudi ora
          </button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Fase">
              <select value={d.stage ?? ""} onChange={(e) => set("stage", e.target.value)} className="input">
                {stages.map((s) => (
                  <option key={s.stage} value={s.stage}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sesso">
              <select value={d.sex ?? "maschio"} onChange={(e) => set("sex", e.target.value as Dragon["sex"])} className="input">
                <option value="maschio">Maschio</option>
                <option value="femmina">Femmina</option>
              </select>
            </Field>
            <Field label="Colore">
              <select value={d.color1 ?? ""} onChange={(e) => set("color1", e.target.value)} className="input">
                {DRAGON_COLORS.map((c) => (
                  <option key={c.name}>{c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Secondo colore">
              <select value={d.color2 ?? ""} onChange={(e) => set("color2", e.target.value || null)} className="input">
                <option value="">Nessuno (monocolore)</option>
                {DRAGON_COLORS.filter((c) => c.name !== d.color1).map((c) => (
                  <option key={c.name}>{c.name}</option>
                ))}
              </select>
            </Field>
          </div>

          <TraitsPicker traits={traits} pregi={d.pregi} difetti={d.difetti} onChange={(p, df) => setD((x) => ({ ...x, pregi: p, difetti: df }))} />

          <Field label="Carattere">
            <div className="space-y-1.5">
              <textarea value={d.temperament} onChange={(e) => set("temperament", e.target.value)} rows={8} className="input" />
              <button
                type="button"
                onClick={async () => {
                  const { data } = await supabase.rpc("dragon_compose_temperament", { p_pregi: d.pregi, p_difetti: d.difetti });
                  if (typeof data === "string") set("temperament", data);
                }}
                className="text-xs text-accent hover:underline"
              >
                ⟳ Nuovo carattere a caso, con i pregi e difetti scelti qui sopra
              </button>
            </div>
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <NumberGrid title="Caratteristiche" items={STATS} values={d.stats} onChange={(v) => set("stats", v)} />
            <NumberGrid title="Abilità" items={skills} values={d.skills} onChange={(v) => set("skills", v)} />
          </div>
          <Field label="Punti ancora da distribuire (dal cavaliere)">
            <input
              type="number"
              min={0}
              max={100}
              value={d.unspent_points}
              onChange={(e) => set("unspent_points", Math.max(0, Number(e.target.value) || 0))}
              className="input w-28"
            />
          </Field>
        </>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <button type="button" onClick={save} disabled={busy} className="btn">
          Salva
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            if (!window.confirm(`Eliminare definitivamente ${dragonName(d)}?`)) return;
            if (await run(() => supabase.from("dragons").delete().eq("id", d.id), "Drago eliminato.")) onDeleted();
          }}
          className="btn-ghost border-red-900 text-red-400 hover:border-red-500 hover:text-red-300"
        >
          Elimina
        </button>
        {feedback}
      </div>
    </div>
  );
}

// Pregi e difetti: un pregio esclude il suo opposto (e viceversa)
function TraitsPicker({
  traits,
  pregi,
  difetti,
  onChange,
}: {
  traits: TraitPair[];
  pregi: string[];
  difetti: string[];
  onChange: (pregi: string[], difetti: string[]) => void;
}) {
  const chip = (label: string, active: boolean, blocked: string | null, toggle: () => void) => (
    <button
      key={label}
      type="button"
      onClick={toggle}
      disabled={!!blocked}
      title={blocked ? `Non può convivere con "${blocked}"` : undefined}
      aria-pressed={active}
      className={`border px-2.5 py-1 font-serif text-[13px] transition ${
        active
          ? "border-[#c9a05a] bg-[#c9a05a]/15 text-[#f0dcae]"
          : blocked
            ? "cursor-not-allowed border-border/40 text-muted/40"
            : "border-border text-muted hover:border-[#c9a05a]/60 hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
  const pregiSorted = [...traits].sort((a, b) => a.pregio.localeCompare(b.pregio));
  const difettiSorted = [...traits].sort((a, b) => a.difetto.localeCompare(b.difetto));
  return (
    <div className="space-y-4">
      <div>
        <h4 className="mb-2 font-serif text-sm tracking-[0.2em] text-accent uppercase">Pregi</h4>
        <div className="flex flex-wrap gap-1.5">
          {pregiSorted.map((t) => {
            const active = pregi.includes(t.pregio);
            const blocked = !active && difetti.includes(t.difetto) ? t.difetto : null;
            return chip(t.pregio, active, blocked, () =>
              onChange(active ? pregi.filter((p) => p !== t.pregio) : [...pregi, t.pregio], difetti),
            );
          })}
        </div>
      </div>
      <div className="border-t border-border/60 pt-4">
        <h4 className="mb-2 font-serif text-sm tracking-[0.2em] text-accent uppercase">Difetti</h4>
        <div className="flex flex-wrap gap-1.5">
          {difettiSorted.map((t) => {
            const active = difetti.includes(t.difetto);
            const blocked = !active && pregi.includes(t.pregio) ? t.pregio : null;
            return chip(t.difetto, active, blocked, () =>
              onChange(pregi, active ? difetti.filter((x) => x !== t.difetto) : [...difetti, t.difetto]),
            );
          })}
        </div>
      </div>
      <p className="text-sm text-muted">
        Pregi e difetti cambiano il mantenimento (poco affamato / molto affamato). Un pregio e il difetto che gli fa da specchio non
        convivono, e il database lo impedisce.
      </p>
    </div>
  );
}

function NumberGrid({
  title,
  items,
  values,
  onChange,
}: {
  title: string;
  items: readonly { key: string; label: string }[];
  values: Record<string, number>;
  onChange: (v: Record<string, number>) => void;
}) {
  return (
    <section>
      <h4 className="mb-2 font-serif text-sm tracking-wider text-accent uppercase">{title}</h4>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <li key={it.key} className="flex items-center gap-2 text-sm">
            <span className="flex-1">{it.label}</span>
            <input
              type="number"
              min={0}
              max={MAX_VALUE}
              value={values[it.key] ?? 0}
              onChange={(e) => onChange({ ...values, [it.key]: Math.min(MAX_VALUE, Math.max(0, Number(e.target.value) || 0)) })}
              aria-label={it.label}
              className="input w-20 py-1"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ImageUpload({ dragonId, hasImage }: { dragonId: string; hasImage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send(form: FormData) {
    setBusy(true);
    setError(null);
    form.set("id", dragonId);
    const res = await saveDragonImage(form);
    setBusy(false);
    if (res.error) setError(res.error);
    else router.refresh();
  }
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <label className="cursor-pointer text-accent hover:underline">
        {busy ? "Caricamento..." : hasImage ? "Cambia immagine" : "Carica un'immagine"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const form = new FormData();
            form.set("image", file);
            send(form);
          }}
        />
      </label>
      {hasImage && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const form = new FormData();
            form.set("remove", "1");
            send(form);
          }}
          className="text-muted hover:text-red-400"
        >
          Rimuovi immagine
        </button>
      )}
      {error && <span className="text-red-400">{error}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------
// Fasi: PX per crescere e mantenimento mensile
// ---------------------------------------------------------------------
function StagesTab({ stages }: { stages: DragonStage[] }) {
  const { supabase, run, busy, feedback } = useOp();
  const [rows, setRows] = useState(stages);
  const update = (stage: string, k: "px_to_next" | "monthly_upkeep" | "stat_points" | "skill_points" | "stat_cap", v: number) =>
    setRows((r) => r.map((s) => (s.stage === stage ? { ...s, [k]: v } : s)));

  async function saveAll() {
    for (const s of rows) {
      const ok = await run(
        () =>
          supabase
            .from("dragon_stages")
            .update({
              px_to_next: s.px_to_next,
              monthly_upkeep: s.monthly_upkeep,
              stat_points: s.stat_points,
              skill_points: s.skill_points,
              stat_cap: Math.min(10, Math.max(1, s.stat_cap)),
            })
            .eq("stage", s.stage),
        "Fasi salvate.",
      );
      if (!ok) return;
    }
  }

  return (
    <div className="max-w-5xl space-y-4">
      <p className="text-sm text-muted">
        Alla generazione (schiusa o creazione) un drago riceve i punti della sua fase: le caratteristiche partono da 0 e non superano il
        tetto, le abilità sono a caso per neonato e cucciolo e omogenee (nessuna a 0) da adolescente in su. Per passare alla fase successiva il cavaliere spende i PX indicati; a ogni passaggio il drago riceve 5 punti da distribuire tra
        caratteristiche e abilità (massimo {MAX_VALUE} per voce). Il mantenimento sono le risorse della casata consumate ogni mese.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs tracking-wider text-muted uppercase">
            <th className="py-2">Fase</th>
            <th className="py-2">PX per crescere</th>
            <th className="py-2">Mantenimento / mese</th>
            <th className="py-2">Punti caratteristiche</th>
            <th className="py-2">Tetto caratteristica</th>
            <th className="py-2">Punti abilità</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s, i) => (
            <tr key={s.stage} className="border-b border-border/50">
              <td className="py-2 font-serif">
                {s.label}
                {rows[i + 1] && <span className="text-xs text-muted"> → {rows[i + 1].label}</span>}
              </td>
              <td className="py-2">
                {s.px_to_next === null ? (
                  <span className="text-muted">ultima fase</span>
                ) : (
                  <input
                    type="number"
                    min={0}
                    value={s.px_to_next}
                    onChange={(e) => update(s.stage, "px_to_next", Math.max(0, Number(e.target.value) || 0))}
                    aria-label={`PX per crescere da ${s.label}`}
                    className="input w-28 py-1"
                  />
                )}
              </td>
              <td className="py-2">
                <input
                  type="number"
                  min={0}
                  value={s.monthly_upkeep}
                  onChange={(e) => update(s.stage, "monthly_upkeep", Math.max(0, Number(e.target.value) || 0))}
                  aria-label={`Mantenimento di ${s.label}`}
                  className="input w-28 py-1"
                />
              </td>
              {(["stat_points", "stat_cap", "skill_points"] as const).map((k) => (
                <td key={k} className="py-2">
                  <input
                    type="number"
                    min={k === "stat_cap" ? 1 : 0}
                    max={k === "stat_cap" ? 10 : 200}
                    value={s[k]}
                    onChange={(e) => update(s.stage, k, Math.max(0, Number(e.target.value) || 0))}
                    aria-label={`${k} di ${s.label}`}
                    className="input w-24 py-1"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-3">
        <button type="button" onClick={saveAll} disabled={busy} className="btn">
          Salva
        </button>
        {feedback}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs tracking-wider text-muted uppercase">{label}</span>
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------
// Abilita': nome e ordine modificabili, si aggiungono e si eliminano
// ---------------------------------------------------------------------
function SkillsTab({ skills }: { skills: DragonSkill[] }) {
  const { supabase, run, busy, feedback } = useOp();
  const [rows, setRows] = useState(skills);
  const [label, setLabel] = useState("");
  const changed = (s: DragonSkill) => skills.find((x) => x.key === s.key)?.label !== s.label;

  // chiave tecnica dal nome: "Attacco di coda" -> "attacco_di_coda"
  const keyFrom = (text: string) =>
    text
      .normalize("NFD")
      .replace(/[^\w\s]/g, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .slice(0, 40);

  async function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
    for (const [k, s] of next.entries()) {
      await supabase.from("dragon_skills").update({ sort_order: k }).eq("key", s.key);
    }
    invalidateDragonSkills();
    run(() => Promise.resolve({ error: null }), "Ordine salvato.");
  }

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-muted">
        Le abilità dei draghi. Una nuova abilità vale 0 per i draghi già esistenti e riceve punti nelle prossime generazioni e crescite.
        Eliminandola sparisce dai valori di tutti i draghi.
      </p>
      {feedback}
      <ul className="divide-y divide-border/60 border border-border/60">
        {rows.map((s, i) => (
          <li key={s.key} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
            <input
              value={s.label}
              onChange={(e) => setRows((r) => r.map((x) => (x.key === s.key ? { ...x, label: e.target.value } : x)))}
              maxLength={60}
              aria-label={`Nome dell'abilità ${s.label}`}
              className="input w-64! py-1"
            />
            <span className="text-xs text-muted">{s.key}</span>
            <span className="ml-auto flex gap-1">
              <button type="button" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="Sposta su" className="btn-ghost px-2 py-1 text-xs">
                ↑
              </button>
              <button type="button" disabled={busy || i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Sposta giù" className="btn-ghost px-2 py-1 text-xs">
                ↓
              </button>
              <button
                type="button"
                disabled={busy || !changed(s) || !s.label.trim()}
                onClick={async () => {
                  if (await run(() => supabase.from("dragon_skills").update({ label: s.label.trim() }).eq("key", s.key), "Abilità rinominata.")) invalidateDragonSkills();
                }}
                className="btn px-3 py-1 text-xs"
              >
                Salva
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (!window.confirm(`Eliminare l'abilità "${s.label}"? Verrà tolta da tutti i draghi.`)) return;
                  if (await run(() => supabase.from("dragon_skills").delete().eq("key", s.key), "Abilità eliminata.")) {
                    invalidateDragonSkills();
                    setRows((r) => r.filter((x) => x.key !== s.key));
                  }
                }}
                className="btn-ghost border-red-900 px-2 py-1 text-xs text-red-400 hover:border-red-500"
              >
                Elimina
              </button>
            </span>
          </li>
        ))}
      </ul>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const key = keyFrom(label);
          if (!key) return;
          const ok = await run(
            () => supabase.from("dragon_skills").insert({ key, label: label.trim(), sort_order: rows.length }),
            `Abilità "${label.trim()}" aggiunta.`,
          );
          if (ok) {
            invalidateDragonSkills();
            setRows((r) => [...r, { key, label: label.trim(), sort_order: r.length }]);
            setLabel("");
          }
        }}
        className="flex gap-2"
      >
        <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="Nuova abilità (es. Nuotare)" className="input w-64!" />
        <button className="btn px-4 text-sm" disabled={busy || !keyFrom(label)}>
          + Aggiungi
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------
// Pregi e difetti: coppie di opposti, ognuno con la sua frase di carattere
// ---------------------------------------------------------------------
export type TraitRow = TraitPair & { pregio_text: string; difetto_text: string };

function TraitsTab({ traits }: { traits: TraitRow[] }) {
  const { supabase, run, busy, feedback } = useOp();
  const empty = { pregio: "", difetto: "", pregio_text: "", difetto_text: "" };
  const [draft, setDraft] = useState<TraitRow>(empty);

  return (
    <div className="max-w-5xl space-y-4">
      <p className="text-sm text-muted">
        Ogni pregio ha il suo difetto opposto: alla generazione non possono uscire insieme. La frase di ciascun tratto entra nel carattere
        dei nuovi draghi. Se rinomini un tratto il nome si aggiorna anche sui draghi che ce l&apos;hanno; se elimini una coppia, viene tolta
        dai draghi.
      </p>
      {feedback}
      <ul className="space-y-3">
        {traits.map((t) => (
          <TraitPairEditor key={t.pregio} pair={t} busy={busy} run={run} supabase={supabase} />
        ))}
      </ul>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => supabase.from("dragon_trait_pairs").insert({ ...draft, pregio: draft.pregio.trim(), difetto: draft.difetto.trim() }), "Coppia aggiunta."))
            setDraft(empty);
        }}
        className="space-y-2 border border-dashed border-accent/50 p-3"
      >
        <p className="text-xs tracking-wider text-muted uppercase">Nuova coppia</p>
        <TraitFields value={draft} onChange={setDraft} />
        <button className="btn px-4 py-1.5 text-sm" disabled={busy || !draft.pregio.trim() || !draft.difetto.trim()}>
          + Aggiungi coppia
        </button>
      </form>
    </div>
  );
}

function TraitPairEditor({
  pair,
  busy,
  run,
  supabase,
}: {
  pair: TraitRow;
  busy: boolean;
  run: ReturnType<typeof useOp>["run"];
  supabase: ReturnType<typeof useOp>["supabase"];
}) {
  const [v, setV] = useState(pair);
  const changed = JSON.stringify(v) !== JSON.stringify(pair);
  return (
    <li className="space-y-2 border border-border/60 p-3">
      <TraitFields value={v} onChange={setV} />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || !changed || !v.pregio.trim() || !v.difetto.trim()}
          onClick={() =>
            run(
              () =>
                supabase
                  .from("dragon_trait_pairs")
                  .update({ pregio: v.pregio.trim(), difetto: v.difetto.trim(), pregio_text: v.pregio_text, difetto_text: v.difetto_text })
                  .eq("pregio", pair.pregio),
              "Coppia salvata.",
            )
          }
          className="btn px-3 py-1 text-xs"
        >
          Salva
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            window.confirm(`Eliminare la coppia "${pair.pregio}" / "${pair.difetto}"? Verrà tolta dai draghi che la hanno.`) &&
            run(() => supabase.from("dragon_trait_pairs").delete().eq("pregio", pair.pregio), "Coppia eliminata.")
          }
          className="btn-ghost border-red-900 px-2 py-1 text-xs text-red-400 hover:border-red-500"
        >
          Elimina coppia
        </button>
      </div>
    </li>
  );
}

function TraitFields({ value, onChange }: { value: TraitRow; onChange: (v: TraitRow) => void }) {
  const set = (k: keyof TraitRow, x: string) => onChange({ ...value, [k]: x });
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="space-y-1.5">
        <input value={value.pregio} onChange={(e) => set("pregio", e.target.value)} maxLength={60} placeholder="Pregio" aria-label="Pregio" className="input py-1 text-[#e8cf9c]" />
        <textarea value={value.pregio_text} onChange={(e) => set("pregio_text", e.target.value)} rows={2} placeholder="Come si vede nel carattere del drago" aria-label="Frase del pregio" className="input text-sm" />
      </div>
      <div className="space-y-1.5">
        <input value={value.difetto} onChange={(e) => set("difetto", e.target.value)} maxLength={60} placeholder="Difetto opposto" aria-label="Difetto" className="input py-1 text-red-300" />
        <textarea value={value.difetto_text} onChange={(e) => set("difetto_text", e.target.value)} rows={2} placeholder="Come si vede nel carattere del drago" aria-label="Frase del difetto" className="input text-sm" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Caratteri di base ("Titolo — descrizione")
// ---------------------------------------------------------------------
export type TemperamentRow = { id: number; text: string };

function TemperamentsTab({ temperaments }: { temperaments: TemperamentRow[] }) {
  const { supabase, run, busy, feedback } = useOp();
  const [draft, setDraft] = useState("");
  return (
    <div className="max-w-4xl space-y-4">
      <p className="text-sm text-muted">
        I caratteri da cui pescano i nuovi draghi (uno diverso per drago finché possibile), poi completati dalle frasi dei loro pregi e
        difetti. Scrivi &quot;Titolo — descrizione&quot;: il titolo comparirà in evidenza. I draghi già nati tengono il loro testo.
      </p>
      {feedback}
      <ul className="space-y-3">
        {temperaments.map((t) => (
          <TemperamentEditor key={t.id} row={t} busy={busy} run={run} supabase={supabase} />
        ))}
      </ul>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => supabase.from("dragon_temperaments").insert({ text: draft.trim() }), "Carattere aggiunto.")) setDraft("");
        }}
        className="space-y-2 border border-dashed border-accent/50 p-3"
      >
        <p className="text-xs tracking-wider text-muted uppercase">Nuovo carattere</p>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} placeholder="Titolo — descrizione del carattere" className="input text-sm" />
        <button className="btn px-4 py-1.5 text-sm" disabled={busy || !draft.trim()}>
          + Aggiungi carattere
        </button>
      </form>
    </div>
  );
}

function TemperamentEditor({
  row,
  busy,
  run,
  supabase,
}: {
  row: TemperamentRow;
  busy: boolean;
  run: ReturnType<typeof useOp>["run"];
  supabase: ReturnType<typeof useOp>["supabase"];
}) {
  const [text, setText] = useState(row.text);
  return (
    <li className="space-y-2 border border-border/60 p-3">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} aria-label="Carattere" className="input text-sm" />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || text.trim() === row.text || !text.trim()}
          onClick={() => run(() => supabase.from("dragon_temperaments").update({ text: text.trim() }).eq("id", row.id), "Carattere salvato.")}
          className="btn px-3 py-1 text-xs"
        >
          Salva
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            window.confirm("Eliminare questo carattere? I draghi che l'hanno già lo tengono.") &&
            run(() => supabase.from("dragon_temperaments").delete().eq("id", row.id), "Carattere eliminato.")
          }
          className="btn-ghost border-red-900 px-2 py-1 text-xs text-red-400 hover:border-red-500"
        >
          Elimina
        </button>
      </div>
    </li>
  );
}
