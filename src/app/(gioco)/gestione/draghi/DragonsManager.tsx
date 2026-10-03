"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { DragonPortrait } from "@/components/draghi/DragonCard";
import { saveDragonImage } from "@/components/draghi/actions";
import {
  DRAGON_COLORS,
  MAX_VALUE,
  SKILLS,
  STATS,
  dragonName,
  monthlyUpkeep,
  stageLabel,
  type Dragon,
  type DragonStage,
  type TraitPair,
} from "@/lib/dragons";
import { createClient } from "@/lib/supabase/client";

export type HouseLite = { id: string; name: string; sigil_url: string | null };
export type PgLite = { id: string; name: string; house_id: string | null; px: number; status: string };

type Props = {
  houses: HouseLite[];
  dragons: Dragon[];
  stages: DragonStage[];
  traits: TraitPair[];
  pgs: PgLite[];
};

const TABS = [
  { id: "draghi", label: "Draghi" },
  { id: "fasi", label: "Fasi e costi" },
  { id: "px", label: "PX dei personaggi" },
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
        {tab === "px" && <PxTab pgs={props.pgs} houses={props.houses} />}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------
// Draghi per casata
// ---------------------------------------------------------------------
function DragonsTab({ houses, dragons, stages, traits, pgs }: Props) {
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
        <DragonEditor key={selected.id + selected.stage + selected.status} dragon={selected} {...{ houses, dragons, stages, traits, pgs }} onDeleted={() => setSelectedId(null)} />
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
              <textarea value={d.temperament} onChange={(e) => set("temperament", e.target.value)} rows={2} className="input" />
              <button
                type="button"
                onClick={async () => {
                  const { data } = await supabase.rpc("dragon_random_temperament");
                  if (typeof data === "string") set("temperament", data);
                }}
                className="text-xs text-accent hover:underline"
              >
                ⟳ Nuovo carattere a caso
              </button>
            </div>
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <NumberGrid title="Caratteristiche" items={STATS} values={d.stats} onChange={(v) => set("stats", v)} />
            <NumberGrid title="Abilità" items={SKILLS} values={d.skills} onChange={(v) => set("skills", v)} />
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

// ---------------------------------------------------------------------
// PX dei personaggi (per ora assegnati a mano dallo staff)
// ---------------------------------------------------------------------
function PxTab({ pgs, houses }: { pgs: PgLite[]; houses: HouseLite[] }) {
  const { supabase, run, busy, feedback } = useOp();
  const [query, setQuery] = useState("");
  const [amount, setAmount] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const q = query.trim().toLowerCase();
  const list = pgs.filter((p) => p.status === "attivo" && (!q || p.name.toLowerCase().includes(q)));

  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-sm text-muted">
        I PX si spendono per far crescere i draghi. Per ora li assegna lo staff: un numero negativo li toglie. Ogni movimento resta
        registrato.
      </p>
      <div className="flex flex-wrap gap-3">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca un personaggio..." className="input w-64" />
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (es. giocata del 3 ottobre)" maxLength={200} className="input min-w-64 flex-1" />
      </div>
      {feedback}
      <ul className="divide-y divide-border/60 border border-border/60">
        {list.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
            <span className="min-w-40 flex-1 font-serif">
              {p.name} <span className="text-xs text-muted">{houses.find((h) => h.id === p.house_id)?.name ?? ""}</span>
            </span>
            <span className="w-20 text-right">
              <strong>{p.px}</strong> PX
            </span>
            <input
              type="number"
              value={amount[p.id] ?? ""}
              onChange={(e) => setAmount((a) => ({ ...a, [p.id]: e.target.value }))}
              placeholder="+/-"
              aria-label={`PX da dare a ${p.name}`}
              className="input w-24 py-1"
            />
            <button
              type="button"
              disabled={busy || !Number(amount[p.id])}
              onClick={async () => {
                const n = Math.trunc(Number(amount[p.id]));
                if (await run(() => supabase.rpc("staff_grant_px", { p_character: p.id, p_amount: n, p_reason: reason }), `PX aggiornati per ${p.name}.`))
                  setAmount((a) => ({ ...a, [p.id]: "" }));
              }}
              className="btn px-3 py-1 text-xs"
            >
              Assegna
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="px-3 py-3 text-sm text-muted">Nessun personaggio attivo trovato.</li>}
      </ul>
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
