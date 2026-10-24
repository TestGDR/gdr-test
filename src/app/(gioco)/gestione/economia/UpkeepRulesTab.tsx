"use client";

import { useCallback, useEffect, useState } from "react";
import type { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------
// Gestione -> Economia -> Esercito e mercato (migrazioni 0156 e 0164):
// mantenimento dei soldati ogni 1000, riserva, guerra, draghi affamati,
// mercato PNG di emergenza, effetti delle strutture (sconti e umore) e tetti.
// ---------------------------------------------------------------------

type Settings = Record<string, number>;
const FIELDS: { key: string; label: string; hint: string; min: number; max: number }[] = [
  { key: "reserve_factor", label: "Riserva e congedo ×", hint: "quanto pagano i soldati in riserva o congedati (0,25 = un quarto)", min: 0, max: 1 },
  { key: "war_factor", label: "Guerra ×", hint: "mantenimento delle truppe in campo durante una guerra", min: 0, max: 20 },
  { key: "war_forage_per_100", label: "Foraggio ogni 100 soldati", hint: "Alimenti in più al mese in guerra", min: 0, max: 1000 },
  { key: "war_labor_cut", label: "Calo Manodopera in guerra", hint: "0,15 = la Manodopera prodotta cala del 15%", min: 0, max: 1 },
  { key: "dragon_hunger_factor", label: "Draghi Affamati ×", hint: "mantenimento dei draghi mentre sono Affamati", min: 1, max: 10 },
  { key: "npc_buy_price", label: "Mercato PNG: compra a", hint: "Oro per unità", min: 0, max: 1000 },
  { key: "npc_sell_price", label: "Mercato PNG: vende a", hint: "Oro per unità", min: 0, max: 1000 },
  { key: "npc_monthly_limit", label: "Mercato PNG: tetto al mese", hint: "unità per risorsa e per casata", min: 0, max: 1000000 },
];
// tetti degli sconti e dell'umore (migrazione 0164)
const CAPS: typeof FIELDS = [
  { key: "cap_soldiers", label: "Tetto sconto soldati %", hint: "somma degli sconti su tutte le risorse", min: 0, max: 100 },
  { key: "cap_soldiers_resource", label: "Tetto sconto su una risorsa %", hint: "generale + sconto apposta (es. Ferro)", min: 0, max: 100 },
  { key: "cap_dragons", label: "Tetto sconto draghi %", hint: "Bestiame dei draghi", min: 0, max: 100 },
  { key: "cap_training", label: "Tetto sconto addestramento %", hint: "Manodopera per addestrare", min: 0, max: 100 },
  { key: "cap_mood_bonus", label: "Tetto punti umore", hint: "per feudo, dalle strutture", min: 0, max: 100 },
];

const KINDS: { id: string; label: string; unit: string }[] = [
  { id: "sconto_soldati_tutte", label: "Sconto soldati (tutte le risorse)", unit: "%" },
  { id: "sconto_soldati_risorsa", label: "Sconto soldati su una risorsa", unit: "%" },
  { id: "sconto_draghi", label: "Sconto Bestiame dei draghi", unit: "%" },
  { id: "sconto_foraggio_guerra", label: "Sconto foraggio di guerra", unit: "%" },
  { id: "sconto_addestramento", label: "Sconto Manodopera per addestrare", unit: "%" },
  { id: "bonus_umore", label: "Punti di umore del feudo", unit: "punti" },
];

const num = (x: string) => Number(x.replace(",", "."));

export default function UpkeepRulesTab({
  supabase,
  resources,
  structures,
  reload,
}: {
  supabase: ReturnType<typeof createClient>;
  resources: { id: string; name: string }[];
  structures: { id: string; name: string }[];
  reload: () => void;
}) {
  const [values, setValues] = useState<Record<string, string> | null | undefined>(undefined);
  const [hasCaps, setHasCaps] = useState(false);
  const [army, setArmy] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from("economy_settings").select("*").maybeSingle(),
      supabase.from("army_upkeep").select("resource_id, per_1000"),
    ]).then(([s, a]) => {
      if (s.error || !s.data) return setValues(null);
      const row = s.data as unknown as Settings;
      const keys = [...FIELDS, ...CAPS].filter((f) => row[f.key] !== undefined);
      setHasCaps(row.cap_soldiers !== undefined);
      setValues(Object.fromEntries(keys.map((f) => [f.key, String(row[f.key]).replace(".", ",")])));
      setArmy(Object.fromEntries(((a.data ?? []) as { resource_id: string; per_1000: number }[]).map((x) => [x.resource_id, String(x.per_1000).replace(".", ",")])));
    });
  }, [supabase]);

  if (values === undefined) return <p className="text-muted">Caricamento...</p>;
  if (values === null) return <p className="text-sm text-amber-200">Per queste regole va eseguita la migrazione 0156 in Supabase.</p>;

  const fields = [...FIELDS, ...(hasCaps ? CAPS : [])];
  const bad = fields.some((f) => !(num(values[f.key] ?? "") >= f.min && num(values[f.key] ?? "") <= f.max));
  const badArmy = Object.values(army).some((v) => v.trim() !== "" && !(num(v) >= 0));

  async function save() {
    setMsg(null);
    const upd = await supabase
      .from("economy_settings")
      .update(Object.fromEntries(fields.map((f) => [f.key, num(values![f.key])])))
      .eq("id", true);
    // mantenimento ogni 1000 soldati: le righe vuote o a zero si tolgono
    const keep = Object.entries(army).filter(([, v]) => v.trim() !== "" && num(v) > 0);
    const del = await supabase.from("army_upkeep").delete().not("resource_id", "in", `(${keep.map(([id]) => id).join(",") || "00000000-0000-0000-0000-000000000000"})`);
    const ins = keep.length
      ? await supabase.from("army_upkeep").upsert(keep.map(([resource_id, v]) => ({ resource_id, per_1000: num(v) })))
      : { error: null };
    const error = upd.error || del.error || ins.error;
    setMsg(error ? { ok: false, text: "Non tutto è stato salvato." } : { ok: true, text: "Salvato: vale dal prossimo 1° del mese." });
    if (!error) reload();
  }

  const input = (f: (typeof FIELDS)[number]) => (
    <label key={f.key} className="block">
      <span className="mb-1 block text-xs text-muted">{f.label}</span>
      <input inputMode="decimal" value={values[f.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v!, [f.key]: e.target.value }))} className="input py-1.5" />
      <span className="mt-0.5 block text-[0.6875rem] text-muted">{f.hint}</span>
    </label>
  );

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="font-serif text-lg text-accent">Mantenimento dell&apos;esercito</h3>
        <p className="text-xs text-muted">
          Ogni mese, ogni 1000 soldati (navi e macchine da guerra contano come un soldato ciascuna). Si somma all&apos;eventuale mantenimento proprio
          di un tipo di truppa (Gestione → Eserciti).
        </p>
        <div className="flex flex-wrap gap-3">
          {resources.map((r) => (
            <label key={r.id} className="block">
              <span className="mb-1 block text-xs text-muted">{r.name}</span>
              <input
                inputMode="decimal"
                value={army[r.id] ?? ""}
                onChange={(e) => setArmy((a) => ({ ...a, [r.id]: e.target.value }))}
                placeholder="0"
                className="input w-24! py-1.5"
              />
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="font-serif text-lg text-accent">Riserva, guerra, draghi e mercato</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{FIELDS.map(input)}</div>
        <p className="text-xs text-muted">
          La guerra di una casata e lo stato Affamato dei draghi si cambiano dal pannello Feudi → Esercito, scegliendo la casata come staff.
        </p>
      </section>

      {hasCaps && (
        <section className="space-y-2">
          <h3 className="font-serif text-lg text-accent">Tetti degli sconti e dell&apos;umore</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{CAPS.map(input)}</div>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={bad || badArmy} onClick={save} className="btn px-4 py-1.5 text-sm">
          Salva
        </button>
        {(bad || badArmy) && <span className="text-xs text-red-400">Controlla i valori: alcuni sono fuori dai limiti.</span>}
        {msg && <span className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</span>}
      </div>

      {hasCaps && (
        <>
          <MoodSwitch supabase={supabase} />
          <EffectsEditor supabase={supabase} resources={resources} structures={structures} />
        </>
      )}
    </div>
  );
}

// Umore acceso o spento: spento, si calcola ma lo staff non riceve avvisi
function MoodSwitch({ supabase }: { supabase: ReturnType<typeof createClient> }) {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    supabase
      .from("mood_settings")
      .select("enabled")
      .maybeSingle()
      .then(({ data }) => setOn(!!(data as { enabled?: boolean } | null)?.enabled));
  }, [supabase]);
  if (on === null) return null;
  return (
    <label className="flex items-start gap-2 border border-border/60 bg-black/30 px-3 py-2 text-sm">
      <input
        type="checkbox"
        checked={on}
        onChange={async (e) => {
          const v = e.target.checked;
          const { error } = await supabase.from("mood_settings").update({ enabled: v }).eq("id", true);
          if (!error) setOn(v);
        }}
        className="mt-1"
      />
      <span>
        Umore del popolo acceso
        <span className="block text-xs text-muted">
          Spento: l&apos;umore si calcola e si vede, ma a fine mese lo staff non riceve gli avvisi. Accendilo quando i minimi di granaio sono confermati.
        </span>
      </span>
    </label>
  );
}

// Effetti speciali delle strutture: uno per riga, si aggiungono e si tolgono subito
type EffectRow = { id: string; structure_type_id: string; kind: string; resource_id: string | null; value: number };
function EffectsEditor({
  supabase,
  resources,
  structures,
}: {
  supabase: ReturnType<typeof createClient>;
  resources: { id: string; name: string }[];
  structures: { id: string; name: string }[];
}) {
  const [rows, setRows] = useState<EffectRow[] | null>(null);
  const [draft, setDraft] = useState({ structure: "", kind: "bonus_umore", resource: "", value: "" });
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    () => supabase.from("structure_effects").select("*").then(({ data }) => setRows((data ?? []) as EffectRow[])),
    [supabase],
  );
  useEffect(() => {
    load();
  }, [load]);

  const sName = (id: string) => structures.find((s) => s.id === id)?.name ?? "?";
  const rName = (id: string | null) => (id ? (resources.find((r) => r.id === id)?.name ?? "?") : "");
  const kind = (id: string) => KINDS.find((k) => k.id === id);
  const sorted = [...(rows ?? [])].sort((a, b) => sName(a.structure_type_id).localeCompare(sName(b.structure_type_id)));
  const needsRes = draft.kind === "sconto_soldati_risorsa";
  const v = num(draft.value);
  const valid = !!draft.structure && v > 0 && v <= 100 && (!needsRes || !!draft.resource);

  return (
    <section className="space-y-2">
      <h3 className="font-serif text-lg text-accent">Effetti speciali delle strutture</h3>
      <p className="text-xs text-muted">
        Contano solo le strutture finite. Gli sconti si sommano su tutti i feudi della casata (con i tetti qui sopra); i punti di umore si sommano per
        feudo. Valgono dal prossimo 1° del mese.
      </p>
      {rows === null ? (
        <p className="text-sm text-muted">Caricamento...</p>
      ) : (
        <ul className="divide-y divide-border/50 text-sm">
          {sorted.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-1">
              <span className="w-48 shrink-0 font-serif text-accent">{sName(r.structure_type_id)}</span>
              <span className="min-w-0 flex-1">
                {kind(r.kind)?.label ?? r.kind}
                {r.resource_id && ` (${rName(r.resource_id)})`}: <strong>{Number(r.value).toLocaleString("it-IT")}</strong> {kind(r.kind)?.unit}
              </span>
              <button
                type="button"
                onClick={async () => {
                  const { error } = await supabase.from("structure_effects").delete().eq("id", r.id);
                  if (error) return setError("Non tolto.");
                  load();
                }}
                className="text-xs text-red-400 hover:text-red-300"
              >
                Togli
              </button>
            </li>
          ))}
          {sorted.length === 0 && <li className="py-1 text-muted">Nessun effetto.</li>}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2 border border-dashed border-border p-2">
        <select value={draft.structure} onChange={(e) => setDraft({ ...draft, structure: e.target.value })} className="input w-auto! py-1.5 text-sm" aria-label="Struttura">
          <option value="">Struttura...</option>
          {structures.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })} className="input w-auto! py-1.5 text-sm" aria-label="Effetto">
          {KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
        {needsRes && (
          <select value={draft.resource} onChange={(e) => setDraft({ ...draft, resource: e.target.value })} className="input w-auto! py-1.5 text-sm" aria-label="Risorsa">
            <option value="">Risorsa...</option>
            {resources.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
        <input inputMode="decimal" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} placeholder={kind(draft.kind)?.unit} className="input w-24! py-1.5 text-sm" aria-label="Valore" />
        <button
          type="button"
          disabled={!valid}
          onClick={async () => {
            setError(null);
            const { error } = await supabase.from("structure_effects").insert({
              structure_type_id: draft.structure,
              kind: draft.kind,
              resource_id: needsRes ? draft.resource : null,
              value: v,
            });
            if (error) return setError("Effetto non aggiunto.");
            setDraft({ ...draft, value: "" });
            load();
          }}
          className="btn px-3 py-1.5 text-sm"
        >
          Aggiungi
        </button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </section>
  );
}
