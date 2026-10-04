"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { fiefTaxPct, fiefsTaxes, type TaxSettings } from "@/lib/taxes";

// ---------------------------------------------------------------------
// Economia: risorse, tipi di feudo (introiti), strutture (costi e introiti),
// feudi delle casate e tesoro. Tutto scritto dal browser: le regole del
// database lasciano scrivere solo chi ha "economia.gestire".
// ---------------------------------------------------------------------

export type HouseLite = { id: string; name: string; playable: boolean };
export type PlaceLite = { id: string; name: string };
type Resource = { id: string; name: string; description: string; sort_order: number };
type Amount = { resource_id: string; amount: number };
type FiefType = { id: string; name: string; description: string; sort_order: number; incomes: Amount[] };
type StructureType = {
  id: string;
  name: string;
  description: string;
  sort_order: number;
  attack: number;
  defense: number;
  costs: Amount[];
  incomes: Amount[];
  upkeep: Amount[]; // mantenimento mensile
};
type Fief = {
  id: string;
  name: string;
  house_id: string;
  fief_type_id: string | null;
  size: "piccolo" | "medio" | "grande";
  location_id: string | null;
  description: string;
  structures: { id: string; structure_type_id: string; built_by: string; built_at: string; is_background: boolean }[];
};

export const CAPACITY = { piccolo: 5, medio: 7, grande: 10 } as const;
const SIZES = [
  { id: "piccolo", label: "Piccolo (5 strutture)" },
  { id: "medio", label: "Medio (7 strutture)" },
  { id: "grande", label: "Grande (10 strutture)" },
] as const;

const TABS = [
  { id: "risorse", label: "Risorse" },
  { id: "tipi", label: "Tipi di feudo" },
  { id: "strutture", label: "Strutture" },
  { id: "feudi", label: "Feudi" },
  { id: "tasse", label: "Tasse" },
  { id: "tesoro", label: "Tesoro delle casate" },
] as const;
type Tab = (typeof TABS)[number]["id"];

function useCatalog() {
  const supabase = useMemo(() => createClient(), []);
  const [resources, setResources] = useState<Resource[]>([]);
  const [fiefTypes, setFiefTypes] = useState<FiefType[]>([]);
  const [structures, setStructures] = useState<StructureType[]>([]);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    Promise.all([
      supabase.from("resources").select("*").order("sort_order").order("name"),
      supabase.from("fief_types").select("*, incomes:fief_type_incomes(resource_id, amount)").order("sort_order").order("name"),
      supabase
        .from("structure_types")
        .select("*, costs:structure_costs(resource_id, amount), incomes:structure_incomes(resource_id, amount), upkeep:structure_upkeep(resource_id, amount)")
        .order("sort_order")
        .order("name"),
    ]).then(([r, f, s]) => {
      setResources((r.data ?? []) as Resource[]);
      setFiefTypes((f.data ?? []) as FiefType[]);
      setStructures((s.data ?? []) as StructureType[]);
    });
  }, [supabase, version]);
  return { supabase, resources, fiefTypes, structures, reload: () => setVersion((v) => v + 1) };
}

export default function EconomyManager({ houses, places }: { houses: HouseLite[]; places: PlaceLite[] }) {
  const [tab, setTab] = useState<Tab>("feudi");
  const cat = useCatalog();
  return (
    <section className="border border-border bg-black/50">
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-border px-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2.5 text-xs tracking-[0.12em] uppercase transition sm:px-4 ${
              tab === t.id ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-4">
        {tab === "risorse" && <ResourcesTab {...cat} />}
        {tab === "tipi" && <FiefTypesTab {...cat} />}
        {tab === "strutture" && <StructuresTab {...cat} />}
        {tab === "feudi" && <FiefsTab {...cat} houses={houses} places={places} />}
        {tab === "tasse" && <TaxesTab {...cat} houses={houses} />}
        {tab === "tesoro" && <TreasuryTab {...cat} houses={houses} />}
      </div>
    </section>
  );
}

type Cat = ReturnType<typeof useCatalog>;

function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  return msg ? <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p> : null;
}
const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="block space-y-1">
    <span className="block text-xs tracking-wide text-muted uppercase">{label}</span>
    {children}
  </label>
);
const resName = (resources: Resource[], id: string) => resources.find((r) => r.id === id)?.name ?? "?";
const amountsText = (resources: Resource[], list: Amount[]) =>
  list.length ? list.map((a) => `${a.amount} ${resName(resources, a.resource_id)}`).join(", ") : "—";

// Elenco "quantita' + risorsa" (introiti o costi)
function AmountsEditor({ resources, value, onChange }: { resources: Resource[]; value: Amount[]; onChange: (v: Amount[]) => void }) {
  const free = resources.filter((r) => !value.some((a) => a.resource_id === r.id));
  return (
    <div className="space-y-1.5">
      {value.map((a, i) => (
        <div key={a.resource_id} className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            value={a.amount}
            onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, amount: Math.max(1, Math.round(Number(e.target.value) || 1)) } : x)))}
            className="input w-24! py-1"
            aria-label={`Quantità di ${resName(resources, a.resource_id)}`}
          />
          <span className="flex-1 text-sm">{resName(resources, a.resource_id)}</span>
          <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-xs text-red-400 hover:text-red-300">
            Togli
          </button>
        </div>
      ))}
      {free.length > 0 && (
        <select
          value=""
          onChange={(e) => e.target.value && onChange([...value, { resource_id: e.target.value, amount: 10 }])}
          className="input w-56! py-1 text-sm"
          aria-label="Aggiungi una risorsa"
        >
          <option value="">+ aggiungi una risorsa…</option>
          {free.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      )}
      {resources.length === 0 && <p className="text-xs text-muted">Crea prima le risorse nella scheda Risorse.</p>}
    </div>
  );
}

// Sostituisce le righe "quantita'" di un elemento
async function replaceAmounts(supabase: Cat["supabase"], table: string, key: string, id: string, list: Amount[]) {
  const del = await supabase.from(table).delete().eq(key, id);
  if (del.error) return del.error;
  if (!list.length) return null;
  const ins = await supabase.from(table).insert(list.map((a) => ({ [key]: id, resource_id: a.resource_id, amount: a.amount })));
  return ins.error;
}

// ---------------------------------------------------------------------
// Risorse
function ResourcesTab({ supabase, resources, reload }: Cat) {
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function add() {
    if (!name.trim()) return;
    const { error } = await supabase.from("resources").insert({ name: name.trim(), sort_order: resources.length });
    setMsg(error ? { ok: false, text: "Risorsa non aggiunta (forse esiste già)." } : null);
    if (!error) {
      setName("");
      reload();
    }
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Le risorse delle casate (es. oro, legname, ferro, grano, cavalli). Servono per costruire strutture e, in seguito, eserciti e navi.
      </p>
      <div className="flex flex-wrap gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Nuova risorsa" className="input max-w-xs py-1.5" />
        <button type="button" onClick={add} className="btn px-4 py-1.5 text-sm">
          + Aggiungi
        </button>
      </div>
      <Msg msg={msg} />
      <ul className="divide-y divide-border/60 border border-border/60">
        {resources.map((r) => (
          <ResourceRow key={r.id} r={r} supabase={supabase} reload={reload} />
        ))}
        {resources.length === 0 && <li className="p-3 text-sm text-muted">Nessuna risorsa.</li>}
      </ul>
    </div>
  );
}

function ResourceRow({ r, supabase, reload }: { r: Resource; supabase: Cat["supabase"]; reload: () => void }) {
  const [name, setName] = useState(r.name);
  const [description, setDescription] = useState(r.description);
  const [order, setOrder] = useState(String(r.sort_order));
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    const { error } = await supabase.from("resources").update({ name: name.trim(), description, sort_order: Number(order) || 0 }).eq("id", r.id);
    setErr(error ? "Non salvata." : null);
    if (!error) reload();
  }
  async function remove() {
    if (!window.confirm(`Eliminare la risorsa "${r.name}"? Sparirà da tesori, introiti e costi.`)) return;
    await supabase.from("resources").delete().eq("id", r.id);
    reload();
  }
  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2">
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="input w-44! py-1" aria-label="Nome" />
      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrizione" className="input min-w-40 flex-1 py-1" aria-label="Descrizione" />
      <input type="number" value={order} onChange={(e) => setOrder(e.target.value)} className="input w-20! py-1" aria-label="Ordine" title="Ordine" />
      <button type="button" onClick={save} className="btn px-3 py-1 text-xs">
        Salva
      </button>
      <button type="button" onClick={remove} className="text-xs text-red-400 hover:text-red-300">
        Elimina
      </button>
      {err && <span className="text-xs text-red-400">{err}</span>}
    </li>
  );
}

// ---------------------------------------------------------------------
// Tipi di feudo (introiti mensili)
function FiefTypesTab({ supabase, resources, fiefTypes, reload }: Cat) {
  const [editing, setEditing] = useState<FiefType | "new" | null>(null);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Ogni tipo di feudo (es. Castello, Borgo agricolo, Miniera, Porto) dà alla sua casata degli introiti di risorse ogni 1° del mese.
      </p>
      {editing ? (
        <TypeEditor
          title={editing === "new" ? "Nuovo tipo di feudo" : editing.name}
          initial={editing === "new" ? null : editing}
          resources={resources}
          withCosts={false}
          onCancel={() => setEditing(null)}
          onSave={async (row, lists) => {
            const { data, error } =
              editing === "new"
                ? await supabase.from("fief_types").insert(row).select("id").single()
                : await supabase.from("fief_types").update(row).eq("id", editing.id).select("id").single();
            if (error || !data) return "Tipo non salvato (forse il nome esiste già).";
            const e2 = await replaceAmounts(supabase, "fief_type_incomes", "fief_type_id", data.id, lists.incomes);
            if (e2) return "Introiti non salvati.";
            setEditing(null);
            reload();
            return null;
          }}
        />
      ) : (
        <button type="button" onClick={() => setEditing("new")} className="btn px-4 py-1.5 text-sm">
          + Nuovo tipo di feudo
        </button>
      )}
      <ul className="divide-y divide-border/60 border border-border/60">
        {fiefTypes.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
            <span className="min-w-40 flex-1">
              <span className="font-serif text-accent">{t.name}</span>
              {t.description && <span className="block text-xs text-muted">{t.description}</span>}
            </span>
            <span className="text-sm">
              <span className="text-xs text-muted">Introiti al mese: </span>
              {amountsText(resources, t.incomes)}
            </span>
            <button type="button" onClick={() => setEditing(t)} className="text-xs text-muted hover:text-accent">
              Modifica
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm(`Eliminare il tipo "${t.name}"? I feudi di questo tipo resteranno senza tipo (e senza introiti).`)) return;
                await supabase.from("fief_types").delete().eq("id", t.id);
                reload();
              }}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Elimina
            </button>
          </li>
        ))}
        {fiefTypes.length === 0 && <li className="p-3 text-sm text-muted">Nessun tipo di feudo.</li>}
      </ul>
    </div>
  );
}

// Modulo comune per tipi di feudo e strutture
function TypeEditor({
  title,
  initial,
  resources,
  withCosts,
  onSave,
  onCancel,
}: {
  title: string;
  initial: { name: string; description: string; sort_order: number; incomes: Amount[]; costs?: Amount[]; upkeep?: Amount[]; attack?: number; defense?: number } | null;
  resources: Resource[];
  withCosts: boolean; // strutture: costo, mantenimento, attacco e difesa
  onSave: (
    row: { name: string; description: string; sort_order: number; attack?: number; defense?: number },
    lists: { incomes: Amount[]; costs: Amount[]; upkeep: Amount[] },
  ) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [order, setOrder] = useState(String(initial?.sort_order ?? 0));
  const [incomes, setIncomes] = useState<Amount[]>(initial?.incomes ?? []);
  const [costs, setCosts] = useState<Amount[]>(initial?.costs ?? []);
  const [upkeep, setUpkeep] = useState<Amount[]>(initial?.upkeep ?? []);
  const [attack, setAttack] = useState(String(initial?.attack ?? 0));
  const [defense, setDefense] = useState(String(initial?.defense ?? 0));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-3 border border-dashed border-border p-4">
      <h3 className="font-serif text-lg text-accent">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
        <Field label="Nome">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="input py-1.5" />
        </Field>
        <Field label="Ordine">
          <input type="number" value={order} onChange={(e) => setOrder(e.target.value)} className="input py-1.5" />
        </Field>
      </div>
      <Field label="Descrizione">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={2000} className="input resize-y py-1.5" />
      </Field>
      {withCosts && (
        <div className="flex flex-wrap gap-3">
          <Field label="Attacco">
            <input type="number" min={0} value={attack} onChange={(e) => setAttack(e.target.value)} className="input w-28! py-1.5" />
          </Field>
          <Field label="Difesa">
            <input type="number" min={0} value={defense} onChange={(e) => setDefense(e.target.value)} className="input w-28! py-1.5" />
          </Field>
        </div>
      )}
      <div className={`grid gap-4 ${withCosts ? "sm:grid-cols-3" : ""}`}>
        {withCosts && (
          <div className="space-y-1">
            <p className="text-xs tracking-wide text-muted uppercase">Costo di costruzione</p>
            <AmountsEditor resources={resources} value={costs} onChange={setCosts} />
          </div>
        )}
        <div className="space-y-1">
          <p className="text-xs tracking-wide text-muted uppercase">{withCosts ? "Entrate al mese (facoltative)" : "Introiti al mese"}</p>
          <AmountsEditor resources={resources} value={incomes} onChange={setIncomes} />
        </div>
        {withCosts && (
          <div className="space-y-1">
            <p className="text-xs tracking-wide text-muted uppercase">Mantenimento al mese (facoltativo)</p>
            <AmountsEditor resources={resources} value={upkeep} onChange={setUpkeep} />
          </div>
        )}
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={async () => {
            setBusy(true);
            const stats = withCosts
              ? { attack: Math.max(0, Math.round(Number(attack) || 0)), defense: Math.max(0, Math.round(Number(defense) || 0)) }
              : {};
            const err = await onSave({ name: name.trim(), description, sort_order: Number(order) || 0, ...stats }, { incomes, costs, upkeep });
            setBusy(false);
            setError(err);
          }}
          className="btn px-4 py-1.5 text-sm"
        >
          Salva
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost px-3 py-1.5 text-sm">
          Annulla
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Strutture (costo e introiti extra)
function StructuresTab({ supabase, resources, structures, reload }: Cat) {
  const [editing, setEditing] = useState<StructureType | "new" | null>(null);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Le strutture si costruiscono nei feudi spendendo le risorse della casata. Ognuna occupa uno spazio del feudo e può dare introiti extra
        ogni mese (es. Miniera: +20 ferro).
      </p>
      {editing ? (
        <TypeEditor
          title={editing === "new" ? "Nuova struttura" : editing.name}
          initial={editing === "new" ? null : editing}
          resources={resources}
          withCosts
          onCancel={() => setEditing(null)}
          onSave={async (row, lists) => {
            const { data, error } =
              editing === "new"
                ? await supabase.from("structure_types").insert(row).select("id").single()
                : await supabase.from("structure_types").update(row).eq("id", editing.id).select("id").single();
            if (error || !data) return "Struttura non salvata (forse il nome esiste già).";
            if (await replaceAmounts(supabase, "structure_costs", "structure_type_id", data.id, lists.costs)) return "Costi non salvati.";
            if (await replaceAmounts(supabase, "structure_incomes", "structure_type_id", data.id, lists.incomes)) return "Entrate non salvate.";
            if (await replaceAmounts(supabase, "structure_upkeep", "structure_type_id", data.id, lists.upkeep)) return "Mantenimento non salvato.";
            setEditing(null);
            reload();
            return null;
          }}
        />
      ) : (
        <button type="button" onClick={() => setEditing("new")} className="btn px-4 py-1.5 text-sm">
          + Nuova struttura
        </button>
      )}
      <ul className="divide-y divide-border/60 border border-border/60">
        {structures.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
            <span className="min-w-40 flex-1">
              <span className="font-serif text-accent">{t.name}</span>
              {t.description && <span className="block text-xs text-muted">{t.description}</span>}
            </span>
            <span className="text-sm">
              <span className="block">
                <span className="text-xs text-muted">Costa: </span>
                {amountsText(resources, t.costs)}
              </span>
              <span className="block">
                <span className="text-xs text-muted">Rende al mese: </span>
                {amountsText(resources, t.incomes)}
              </span>
              <span className="block">
                <span className="text-xs text-muted">Mantenimento al mese: </span>
                {amountsText(resources, t.upkeep)}
              </span>
              <span className="block">
                <span className="text-xs text-muted">Attacco </span>
                {t.attack} <span className="text-xs text-muted">· Difesa </span>
                {t.defense}
              </span>
            </span>
            <button type="button" onClick={() => setEditing(t)} className="text-xs text-muted hover:text-accent">
              Modifica
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm(`Eliminare la struttura "${t.name}"? Sparirà anche da tutti i feudi in cui è costruita.`)) return;
                await supabase.from("structure_types").delete().eq("id", t.id);
                reload();
              }}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Elimina
            </button>
          </li>
        ))}
        {structures.length === 0 && <li className="p-3 text-sm text-muted">Nessuna struttura.</li>}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------
// Feudi
function FiefsTab({ supabase, resources, fiefTypes, structures, houses, places }: Cat & { houses: HouseLite[]; places: PlaceLite[] }) {
  const [fiefs, setFiefs] = useState<Fief[] | null>(null);
  const [house, setHouse] = useState("");
  const [editing, setEditing] = useState<Fief | "new" | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const load = useCallback(
    () =>
      supabase
        .from("fiefs")
        .select("*, structures:fief_structures(id, structure_type_id, built_by, built_at, is_background)")
        .order("name")
        .then(({ data }) => setFiefs((data ?? []) as Fief[])),
    [supabase],
  );
  useEffect(() => {
    load();
  }, [load]);

  const houseOf = (id: string) => houses.find((h) => h.id === id);
  const shown = (fiefs ?? []).filter((f) => !house || f.house_id === house);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Ogni feudo appartiene a una casata: è PG se la casata è giocabile dai PG, altrimenti PNG. La grandezza decide quante strutture contiene:
        piccolo 5, medio 7, grande 10.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select value={house} onChange={(e) => setHouse(e.target.value)} className="input w-64! py-1.5" aria-label="Casata">
          <option value="">Tutte le casate</option>
          {houses.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name} ({h.playable ? "PG" : "PNG"})
            </option>
          ))}
        </select>
        {!editing && (
          <button type="button" onClick={() => setEditing("new")} className="btn px-4 py-1.5 text-sm">
            + Nuovo feudo
          </button>
        )}
      </div>

      {editing && (
        <FiefEditor
          fief={editing === "new" ? null : editing}
          defaultHouse={house}
          houses={houses}
          places={places}
          fiefTypes={fiefTypes}
          onCancel={() => setEditing(null)}
          onSave={async (row) => {
            const used = editing !== "new" ? editing.structures.length : 0;
            if (used > CAPACITY[row.size]) return `Il feudo ha già ${used} strutture: non può diventare ${row.size}.`;
            const { error } = editing === "new" ? await supabase.from("fiefs").insert(row) : await supabase.from("fiefs").update(row).eq("id", editing.id);
            if (error) return "Feudo non salvato.";
            setEditing(null);
            load();
            return null;
          }}
        />
      )}

      {fiefs === null && <p className="text-sm text-muted">Caricamento...</p>}
      {fiefs !== null && shown.length === 0 && <p className="text-sm text-muted">Nessun feudo.</p>}
      <ul className="space-y-2">
        {shown.map((f) => {
          const h = houseOf(f.house_id);
          const type = fiefTypes.find((t) => t.id === f.fief_type_id);
          const cap = CAPACITY[f.size];
          return (
            <li key={f.id} className="border border-border/60 bg-black/30">
              <div className="flex flex-wrap items-center gap-3 px-3 py-2">
                <button type="button" onClick={() => setOpenId(openId === f.id ? null : f.id)} className="min-w-48 flex-1 text-left">
                  <span className="font-serif text-accent">{f.name}</span>
                  <span className="block text-xs text-muted">
                    {h?.name ?? "?"} · feudo {h?.playable ? "PG" : "PNG"} · {type?.name ?? "senza tipo"} · {f.size}
                    {f.location_id && ` · ${places.find((p) => p.id === f.location_id)?.name ?? ""}`}
                  </span>
                </button>
                <span className={`text-sm ${f.structures.length >= cap ? "text-orange-300" : ""}`}>
                  Strutture {f.structures.length}/{cap}
                  <span className="block text-xs text-muted">
                    Attacco {f.structures.reduce((n, s) => n + (structures.find((t) => t.id === s.structure_type_id)?.attack ?? 0), 0)} · Difesa{" "}
                    {f.structures.reduce((n, s) => n + (structures.find((t) => t.id === s.structure_type_id)?.defense ?? 0), 0)}
                  </span>
                </span>
                <button type="button" onClick={() => setEditing(f)} className="text-xs text-muted hover:text-accent">
                  Modifica
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm(`Eliminare il feudo "${f.name}" con tutte le sue strutture?`)) return;
                    await supabase.from("fiefs").delete().eq("id", f.id);
                    load();
                  }}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Elimina
                </button>
              </div>
              {openId === f.id && <FiefStructures fief={f} supabase={supabase} resources={resources} structures={structures} onChanged={load} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type FiefRow = { name: string; house_id: string; fief_type_id: string | null; size: Fief["size"]; location_id: string | null; description: string };

function FiefEditor({
  fief,
  defaultHouse,
  houses,
  places,
  fiefTypes,
  onSave,
  onCancel,
}: {
  fief: Fief | null;
  defaultHouse: string;
  houses: HouseLite[];
  places: PlaceLite[];
  fiefTypes: FiefType[];
  onSave: (row: FiefRow) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [row, setRow] = useState<FiefRow>({
    name: fief?.name ?? "",
    house_id: fief?.house_id ?? defaultHouse,
    fief_type_id: fief?.fief_type_id ?? null,
    size: fief?.size ?? "medio",
    location_id: fief?.location_id ?? null,
    description: fief?.description ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<FiefRow>) => setRow((r) => ({ ...r, ...p }));
  return (
    <div className="space-y-3 border border-dashed border-border p-4">
      <h3 className="font-serif text-lg text-accent">{fief ? `Modifica ${fief.name}` : "Nuovo feudo"}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome">
          <input value={row.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} className="input py-1.5" />
        </Field>
        <Field label="Casata">
          <select value={row.house_id} onChange={(e) => set({ house_id: e.target.value })} className="input py-1.5">
            <option value="">Scegli la casata…</option>
            {houses.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} ({h.playable ? "PG" : "PNG"})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tipo di feudo">
          <select value={row.fief_type_id ?? ""} onChange={(e) => set({ fief_type_id: e.target.value || null })} className="input py-1.5">
            <option value="">— senza tipo —</option>
            {fiefTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Grandezza">
          <select value={row.size} onChange={(e) => set({ size: e.target.value as Fief["size"] })} className="input py-1.5">
            {SIZES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Macroarea (facoltativa)">
          <select value={row.location_id ?? ""} onChange={(e) => set({ location_id: e.target.value || null })} className="input py-1.5">
            <option value="">— nessuna —</option>
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Descrizione">
        <textarea value={row.description} onChange={(e) => set({ description: e.target.value })} rows={3} maxLength={4000} className="input resize-y py-1.5" />
      </Field>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!row.name.trim() || !row.house_id}
          onClick={async () => setError(await onSave({ ...row, name: row.name.trim() }))}
          className="btn px-4 py-1.5 text-sm"
        >
          Salva
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost px-3 py-1.5 text-sm">
          Annulla
        </button>
      </div>
    </div>
  );
}

// Strutture di un feudo: costruisci (con il costo, dal tesoro della casata) o demolisci
function FiefStructures({
  fief,
  supabase,
  resources,
  structures,
  onChanged,
}: {
  fief: Fief;
  supabase: Cat["supabase"];
  resources: Resource[];
  structures: StructureType[];
  onChanged: () => void;
}) {
  const [pick, setPick] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const cap = CAPACITY[fief.size];
  const name = (id: string) => structures.find((s) => s.id === id)?.name ?? "?";
  // Struttura di BG: assegnata dallo staff, senza costo
  async function assignBg() {
    const { error } = await supabase.rpc("assign_background_structure", { p_fief: fief.id, p_structure_type: pick });
    setMsg(error ? { ok: false, text: error.message.replace("piu''", "più") } : { ok: true, text: "Struttura di BG assegnata." });
    if (!error) {
      setPick("");
      onChanged();
    }
  }

  async function build() {
    const { error } = await supabase.rpc("build_structure", { p_fief: fief.id, p_structure_type: pick });
    setMsg(error ? { ok: false, text: error.message.replace("Risorse insufficienti", "Risorse della casata insufficienti").replace("piu''", "più") } : { ok: true, text: "Struttura costruita." });
    if (!error) {
      setPick("");
      onChanged();
    }
  }
  return (
    <div className="space-y-2 border-t border-border/60 px-3 py-3">
      {fief.description && <p className="text-sm whitespace-pre-line text-muted">{fief.description}</p>}
      <ul className="space-y-1 text-sm">
        {fief.structures.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2">
            <span className="font-serif">{name(s.structure_type_id)}</span>
            {s.is_background && <span className="border border-border px-1 text-[0.625rem] text-muted uppercase">BG</span>}
            <span className="text-xs text-muted">
              {s.is_background ? "di BG, assegnata" : `costruita da ${s.built_by || "?"}`} il {new Date(s.built_at).toLocaleDateString("it-IT")}
            </span>
            <button
              type="button"
              onClick={async () => {
                const note = s.is_background ? "È di BG: non restituisce risorse." : "La casata recupera metà del costo pagato.";
                if (!window.confirm(`Demolire "${name(s.structure_type_id)}"? ${note}`)) return;
                const { data, error } = await supabase.rpc("demolish_structure", { p_structure: s.id });
                const back = Object.entries((data ?? {}) as Record<string, number>).map(([id, n]) => `${n} ${resName(resources, id)}`);
                setMsg(error ? { ok: false, text: "Demolizione non riuscita." } : { ok: true, text: back.length ? `Demolita: recuperati ${back.join(", ")}.` : "Demolita." });
                onChanged();
              }}
              className="ml-auto text-xs text-red-400 hover:text-red-300"
            >
              Demolisci
            </button>
          </li>
        ))}
        {fief.structures.length === 0 && <li className="text-muted">Nessuna struttura.</li>}
      </ul>
      {fief.structures.length < cap ? (
        <div className="flex flex-wrap items-center gap-2">
          <select value={pick} onChange={(e) => setPick(e.target.value)} className="input w-72! py-1 text-sm" aria-label="Struttura da costruire">
            <option value="">Costruisci una struttura…</option>
            {structures.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — costa {amountsText(resources, s.costs)}
              </option>
            ))}
          </select>
          <button type="button" disabled={!pick} onClick={build} className="btn px-3 py-1 text-xs">
            Costruisci (paga la casata)
          </button>
          <button type="button" disabled={!pick} onClick={assignBg} className="btn-ghost px-3 py-1 text-xs" title="Struttura di background: nessun costo">
            Assegna di BG (gratis)
          </button>
        </div>
      ) : (
        <p className="text-xs text-orange-300">Il feudo è pieno: {cap} strutture su {cap}.</p>
      )}
      <Msg msg={msg} />
    </div>
  );
}

// ---------------------------------------------------------------------
// Tasse: casata regnante, percentuali e quanto paghera' ogni feudataria
function TaxesTab({ supabase, resources, fiefTypes, structures, houses }: Cat & { houses: HouseLite[] }) {
  const [settings, setSettings] = useState<TaxSettings | null>(null);
  const [fiefs, setFiefs] = useState<Fief[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    supabase
      .from("tax_settings")
      .select("ruling_house_id, small_pct, medium_pct, large_pct, per_structure_pct, max_pct")
      .maybeSingle()
      .then(({ data }) => setSettings((data as TaxSettings | null) ?? null));
    supabase
      .from("fiefs")
      .select("*, structures:fief_structures(id, structure_type_id, built_by, built_at, is_background)")
      .order("name")
      .then(({ data }) => setFiefs((data ?? []) as Fief[]));
  }, [supabase]);

  if (!settings) return <p className="text-sm text-muted">Caricamento... (serve la migrazione 0064)</p>;
  const set = (p: Partial<TaxSettings>) => setSettings((s) => (s ? { ...s, ...p } : s));
  const num = (v: string) => Math.min(100, Math.max(0, Number(v.replace(",", ".")) || 0));

  async function save() {
    if (!settings) return;
    const { error } = await supabase.from("tax_settings").update(settings).eq("id", true);
    setMsg(error ? { ok: false, text: "Tasse non salvate." } : { ok: true, text: "Tasse salvate." });
  }

  const ruler = houses.find((h) => h.id === settings.ruling_house_id);
  const vassals = houses.filter((h) => h.id !== settings.ruling_house_id && fiefs.some((f) => f.house_id === h.id));
  // tasse di ogni feudataria e totale per la regnante (calcolati prima di disegnare)
  const byHouse = new Map(vassals.map((h) => [h.id, fiefsTaxes(fiefs.filter((f) => f.house_id === h.id), settings, fiefTypes, structures)]));
  const totalIn: Record<string, number> = {};
  for (const t of byHouse.values()) for (const [r, n] of Object.entries(t)) totalIn[r] = (totalIn[r] ?? 0) + n;

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        Ogni 1° del mese, dopo introiti e mantenimento, le casate feudatarie versano alla casata regnante una percentuale di ciò che i loro
        feudi producono, risorsa per risorsa. La percentuale di un feudo dipende dalla grandezza e da quante strutture ha. Se il tesoro
        non basta si paga quello che c&apos;è; il resto resta scritto come non pagato.
      </p>
      <div className="space-y-3 border border-dashed border-border p-4">
        <Field label="Casata regnante (riceve le tasse)">
          <select
            value={settings.ruling_house_id ?? ""}
            onChange={(e) => set({ ruling_house_id: e.target.value || null })}
            className="input max-w-sm py-1.5"
          >
            <option value="">— nessuna: niente tasse —</option>
            {houses.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} ({h.playable ? "PG" : "PNG"})
              </option>
            ))}
          </select>
        </Field>
        <div className="flex flex-wrap gap-3">
          {(
            [
              ["small_pct", "Feudo piccolo (%)"],
              ["medium_pct", "Feudo medio (%)"],
              ["large_pct", "Feudo grande (%)"],
              ["per_structure_pct", "In più per struttura (%)"],
              ["max_pct", "Massimo (%)"],
            ] as const
          ).map(([k, label]) => (
            <Field key={k} label={label}>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={settings[k]}
                onChange={(e) => set({ [k]: num(e.target.value) } as Partial<TaxSettings>)}
                className="input w-28! py-1.5"
              />
            </Field>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={save} className="btn px-4 py-1.5 text-sm">
            Salva
          </button>
          <Msg msg={msg} />
        </div>
      </div>

      {!ruler ? (
        <p className="text-sm text-orange-300">Scegli la casata regnante: senza, nessuno paga tasse.</p>
      ) : (
        <div className="space-y-2">
          <h3 className="font-serif text-lg text-accent">Tasse del prossimo mese</h3>
          {vassals.length === 0 && <p className="text-sm text-muted">Nessuna casata feudataria con feudi.</p>}
          <ul className="space-y-2">
            {vassals.map((h) => {
              const own = fiefs.filter((f) => f.house_id === h.id);
              const taxes = byHouse.get(h.id) ?? {};
              return (
                <li key={h.id} className="border border-border/60 bg-black/30 px-3 py-2 text-sm">
                  <span className="font-serif text-accent">{h.name}</span>{" "}
                  <span className="text-muted">paga:</span>{" "}
                  {Object.keys(taxes).length ? Object.entries(taxes).map(([r, n]) => `${n} ${resName(resources, r)}`).join(", ") : "nulla (i feudi non producono)"}
                  <span className="block text-xs text-muted">
                    {own.map((f) => `${f.name} ${fiefTaxPct(f, settings)}%`).join(" · ")}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-sm">
            <span className="text-muted">Casa {ruler.name} riceve in tutto: </span>
            {Object.keys(totalIn).length ? Object.entries(totalIn).map(([r, n]) => `${n} ${resName(resources, r)}`).join(", ") : "nulla"}
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Tesoro delle casate
function TreasuryTab({ supabase, resources, houses }: Cat & { houses: HouseLite[] }) {
  const [house, setHouse] = useState(houses[0]?.id ?? "");
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [log, setLog] = useState<{ id: number; resource_id: string | null; delta: number; reason: string; created_at: string }[]>([]);
  const [resource, setResource] = useState("");
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(() => {
    if (!house) return;
    supabase
      .from("house_resources")
      .select("resource_id, amount")
      .eq("house_id", house)
      .then(({ data }) => setAmounts(Object.fromEntries((data ?? []).map((r) => [r.resource_id as string, Number(r.amount)]))));
    supabase
      .from("economy_log")
      .select("id, resource_id, delta, reason, created_at")
      .eq("house_id", house)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setLog((data ?? []) as typeof log));
  }, [supabase, house]);
  useEffect(() => {
    load();
  }, [load]);

  async function adjust() {
    const n = Math.round(Number(delta));
    if (!resource || !n) return setMsg({ ok: false, text: "Scegli la risorsa e scrivi una quantità (negativa per togliere)." });
    const { error } = await supabase.rpc("staff_adjust_resource", { p_house: house, p_resource: resource, p_delta: n, p_reason: reason });
    setMsg(error ? { ok: false, text: error.message.includes("insufficienti") ? "La casata non ha abbastanza risorse." : "Correzione non riuscita." } : { ok: true, text: "Tesoro aggiornato." });
    if (!error) {
      setDelta("");
      setReason("");
      load();
    }
  }

  async function payNow() {
    if (!window.confirm("Distribuire adesso gli introiti di un mese a TUTTE le casate? (Si aggiungono a quelli automatici del 1° del mese.)")) return;
    const { error } = await supabase.rpc("pay_monthly_income", { p_force: true });
    setMsg(error ? { ok: false, text: "Distribuzione non riuscita." } : { ok: true, text: "Introiti distribuiti a tutte le casate." });
    load();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Ogni 1° del mese ogni casata riceve gli introiti dei suoi feudi (dal tipo) e delle strutture costruite. Qui vedi e correggi il tesoro.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select value={house} onChange={(e) => setHouse(e.target.value)} className="input w-64! py-1.5" aria-label="Casata">
          {houses.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name} ({h.playable ? "PG" : "PNG"})
            </option>
          ))}
        </select>
        <button type="button" onClick={payNow} className="btn-ghost ml-auto px-3 py-1.5 text-sm">
          Distribuisci ora gli introiti a tutte le casate
        </button>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {resources.map((r) => (
          <li key={r.id} className="border border-border/60 bg-black/30 px-3 py-2">
            <span className="block text-xs text-muted uppercase">{r.name}</span>
            <span className="font-serif text-2xl text-accent">{(amounts[r.id] ?? 0).toLocaleString("it-IT")}</span>
          </li>
        ))}
        {resources.length === 0 && <li className="text-sm text-muted">Crea prima le risorse.</li>}
      </ul>
      <div className="space-y-2 border border-dashed border-border p-3">
        <p className="text-xs tracking-[0.12em] text-accent uppercase">Correggi il tesoro</p>
        <div className="flex flex-wrap items-center gap-2">
          <select value={resource} onChange={(e) => setResource(e.target.value)} className="input w-44! py-1.5" aria-label="Risorsa">
            <option value="">Risorsa…</option>
            {resources.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="+100 o -50" className="input w-32! py-1.5" aria-label="Quantità" />
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (facoltativo)" maxLength={200} className="input min-w-40 flex-1 py-1.5" />
          <button type="button" onClick={adjust} className="btn px-4 py-1.5 text-sm">
            Applica
          </button>
        </div>
      </div>
      <Msg msg={msg} />
      <div>
        <p className="mb-1 text-xs tracking-[0.12em] text-muted uppercase">Ultimi movimenti</p>
        <ul className="divide-y divide-border/60 border border-border/60 text-sm">
          {log.map((l) => (
            <li key={l.id} className="flex flex-wrap gap-x-3 px-3 py-1.5">
              <span className={l.delta > 0 ? "text-green-400" : "text-red-400"}>
                {l.delta > 0 ? "+" : ""}
                {l.delta} {l.resource_id ? resName(resources, l.resource_id) : ""}
              </span>
              <span className="flex-1 text-muted">{l.reason}</span>
              <span className="text-xs text-muted">{new Date(l.created_at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}</span>
            </li>
          ))}
          {log.length === 0 && <li className="px-3 py-2 text-muted">Nessun movimento.</li>}
        </ul>
      </div>
    </div>
  );
}
