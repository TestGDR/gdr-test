"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { AGE_MAX, AGE_MIN } from "@/lib/character-creation";
import { GAME_YEAR } from "@/lib/game-config";
import {
  RELATION_KINDS,
  YEAR_MAX,
  YEAR_MIN,
  lifeLabel,
  type FamilyMember,
  type FamilyRelation,
  type House,
  type HouseMember,
  type HouseNpc,
  type HouseRole,
  type RelationKind,
  type SignupRole,
} from "@/lib/houses";
import { createClient } from "@/lib/supabase/client";
import RichEditor from "@/components/guide/RichEditor";
import { buildTree, byOrder, FamilyCanvas } from "@/components/houses/FamilyTree";
import {
  addMember,
  assignCharacter,
  deleteFamilyMember,
  deleteHouse,
  deleteHouseRole,
  deleteNpc,
  deleteRelation,
  removeMember,
  saveFamilyMember,
  saveHouse,
  saveHouseRole,
  saveNpc,
  saveRelation,
  saveTreePosition,
  resetTreePositions,
  setMemberRole,
  type HouseResult,
} from "./actions";

export type PgAssignment = {
  id: string;
  name: string;
  status: "bozza" | "attivo";
  house_id: string | null;
  house_role_id: string | null;
};

type Data = {
  houses: House[];
  roles: HouseRole[];
  family: FamilyMember[];
  relations: FamilyRelation[];
  npcs: HouseNpc[];
  members: HouseMember[];
  allPgs: PgAssignment[];
};

const NEW = "__nuova";

// Esegue un'azione del server, mostra l'esito e aggiorna i dati della pagina
function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ error?: string; ok?: string } | null>(null);

  function run(action: () => Promise<HouseResult>, ok: string, after?: (res: HouseResult) => void) {
    setMessage(null);
    startTransition(async () => {
      const res = await action();
      if (res.error) return setMessage({ error: res.error });
      setMessage({ ok });
      router.refresh();
      after?.(res);
    });
  }

  const feedback = message && (
    <p className={`text-sm ${message.error ? "text-red-400" : "text-green-400"}`}>{message.error ?? message.ok}</p>
  );
  return { run, pending, feedback, clear: () => setMessage(null) };
}

// Due viste: le casate una per una, oppure l'elenco di tutti i PG con casata e ruolo
export default function HousesManager(data: Data) {
  const [view, setView] = useState<"casate" | "assegna">("casate");
  return (
    <div className="space-y-4">
      <div role="tablist" className="flex gap-1 border-b border-border">
        {(
          [
            ["casate", "Casate"],
            ["assegna", "Assegna PG a casate e ruoli"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-xs tracking-[0.12em] uppercase transition ${
              view === id ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {view === "casate" ? <HousesView {...data} /> : <AssignPgView houses={data.houses} roles={data.roles} pgs={data.allPgs} />}
    </div>
  );
}

// Elenco di tutti i PG: per ognuno si scelgono casata e ruolo e si salva
function AssignPgView({ houses, roles, pgs }: { houses: House[]; roles: HouseRole[]; pgs: PgAssignment[] }) {
  const { run, pending, feedback } = useAction();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("tutti"); // tutti | nessuna | id casata
  const [edits, setEdits] = useState<Record<string, { house: string; role: string }>>({});
  const q = query.trim().toLowerCase();
  const houseName = (id: string | null) => houses.find((h) => h.id === id)?.name ?? "";
  const list = pgs.filter(
    (p) =>
      (!q || p.name.toLowerCase().includes(q) || houseName(p.house_id).toLowerCase().includes(q)) &&
      (filter === "tutti" || (filter === "nessuna" ? !p.house_id : p.house_id === filter)),
  );
  // quanti occupano un ruolo (per mostrare i posti)
  const taken = (roleId: string) => pgs.filter((p) => p.house_role_id === roleId).length;

  return (
    <div className="space-y-4 border border-border bg-black/50 p-4">
      <p className="text-sm text-muted">
        Scegli casata e ruolo di un personaggio e premi Salva. Cambiando casata il ruolo si azzera: scegline uno della casata nuova.
        Lo staff può superare i posti previsti da un ruolo (sono indicati accanto al nome).
      </p>
      <div className="flex flex-wrap gap-3">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca un personaggio o una casata..." className="input w-72!" />
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtra per casata" className="input w-auto!">
          <option value="tutti">Tutti i personaggi</option>
          <option value="nessuna">Senza casata</option>
          {houses.map((h) => (
            <option key={h.id} value={h.id}>
              Casata {h.name}
            </option>
          ))}
        </select>
      </div>
      {feedback}
      <ul className="divide-y divide-border/60 border border-border/60">
        {list.map((p) => {
          const e = edits[p.id] ?? { house: p.house_id ?? "", role: p.house_role_id ?? "" };
          const changed = e.house !== (p.house_id ?? "") || e.role !== (p.house_role_id ?? "");
          const houseRoles = roles.filter((r) => r.house_id === e.house);
          return (
            <li key={p.id} className={`flex flex-wrap items-center gap-3 px-3 py-2 text-sm ${changed ? "bg-blood/10" : ""}`}>
              <span className="min-w-44 flex-1 font-serif">
                {p.name}
                {p.house_id && <span className="text-muted"> {houseName(p.house_id)}</span>}
                {p.status !== "attivo" && <span className="ml-2 text-xs text-orange-300">non attivo</span>}
              </span>
              <select
                value={e.house}
                onChange={(ev) => setEdits((x) => ({ ...x, [p.id]: { house: ev.target.value, role: "" } }))}
                aria-label={`Casata di ${p.name}`}
                className="input w-44! py-1"
              >
                <option value="">Nessuna casata</option>
                {houses.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
              <select
                value={e.role}
                onChange={(ev) => setEdits((x) => ({ ...x, [p.id]: { ...e, role: ev.target.value } }))}
                disabled={!e.house}
                aria-label={`Ruolo di ${p.name}`}
                className="input w-56! py-1 disabled:opacity-40"
              >
                <option value="">Senza ruolo</option>
                {houseRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.max_members !== null ? ` (${taken(r.id)}/${r.max_members})` : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={pending || !changed}
                onClick={() =>
                  run(
                    () => assignCharacter(p.id, e.house || null, e.role || null),
                    `${p.name}: ${e.house ? `casata ${houseName(e.house)}${e.role ? `, ${houseRoles.find((r) => r.id === e.role)?.name}` : ", senza ruolo"}` : "senza casata"}.`,
                    () =>
                      setEdits((x) => {
                        const next = { ...x };
                        delete next[p.id];
                        return next;
                      }),
                  )
                }
                className="btn px-3 py-1 text-xs"
              >
                Salva
              </button>
              {changed && (
                <button
                  type="button"
                  onClick={() =>
                    setEdits((x) => {
                      const next = { ...x };
                      delete next[p.id];
                      return next;
                    })
                  }
                  className="text-xs text-muted hover:text-accent"
                >
                  Annulla
                </button>
              )}
            </li>
          );
        })}
        {list.length === 0 && <li className="px-3 py-3 text-sm text-muted">Nessun personaggio trovato.</li>}
      </ul>
    </div>
  );
}

function HousesView(data: Data) {
  const [selectedId, setSelectedId] = useState<string>(data.houses[0]?.id ?? NEW);
  const house = data.houses.find((h) => h.id === selectedId) ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
      <aside className="h-fit rounded-md border border-border bg-black/50 p-3">
        <ul className="space-y-1">
          {data.houses.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => setSelectedId(h.id)}
                className={`flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm transition hover:bg-blood/20 ${
                  h.id === selectedId ? "bg-blood/30" : ""
                }`}
              >
                <Sigil url={h.sigil_url} name={h.name} size="h-8 w-8" />
                <span className="flex-1 truncate font-serif">{h.name}</span>
                <span className="text-xs text-muted" title="PG membri">
                  {data.members.filter((m) => m.house_id === h.id).length}
                </span>
              </button>
            </li>
          ))}
          {data.houses.length === 0 && <li className="px-2 text-xs text-muted">Nessuna casata.</li>}
        </ul>
        <button
          type="button"
          onClick={() => setSelectedId(NEW)}
          className={`btn-ghost mt-3 w-full text-sm ${selectedId === NEW ? "border-accent text-accent" : ""}`}
        >
          + Nuova casata
        </button>
        <SignupPreview />
      </aside>

      <HouseEditor
        // riparte da zero cambiando casata (e quando una casata appena creata arriva dal server)
        key={`${selectedId}-${house ? "pronta" : "attesa"}`}
        house={house}
        roles={data.roles.filter((r) => r.house_id === house?.id)}
        family={data.family.filter((f) => f.house_id === house?.id)}
        relations={data.relations.filter((r) => r.house_id === house?.id)}
        npcs={data.npcs.filter((n) => n.house_id === house?.id)}
        allNpcs={data.npcs}
        allHouses={data.houses}
        members={data.members.filter((m) => m.house_id === house?.id)}
        onCreated={(id) => setSelectedId(id)}
        onDeleted={() => setSelectedId(data.houses.find((h) => h.id !== selectedId)?.id ?? NEW)}
      />
    </div>
  );
}

// Cosa vedrebbe all'iscrizione un PG con questo sesso ed eta' (stessa regola della creazione)
function SignupPreview() {
  const [sex, setSex] = useState("uomo");
  const [age, setAge] = useState("20");
  const [result, setResult] = useState<SignupRole[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function check(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { data, error } = await createClient().rpc("signup_house_roles", { p_sex: sex, p_age: Number(age) });
    setLoading(false);
    if (error) return setError("Simulazione non riuscita.");
    setResult((data ?? []) as SignupRole[]);
  }

  const byHouse = new Map<string, SignupRole[]>();
  for (const r of result ?? []) byHouse.set(r.house_name, [...(byHouse.get(r.house_name) ?? []), r]);

  return (
    <form onSubmit={check} className="mt-4 space-y-2 border-t border-border pt-3">
      <h3 className="text-xs font-semibold tracking-[0.15em] text-muted uppercase">Simulazione iscrizione</h3>
      <div className="flex gap-2">
        <select value={sex} onChange={(e) => setSex(e.target.value)} className="input py-1 text-sm" aria-label="Sesso">
          <option value="uomo">Uomo</option>
          <option value="donna">Donna</option>
        </select>
        <input type="number" min={AGE_MIN} max={AGE_MAX} value={age} onChange={(e) => setAge(e.target.value)} className="input w-20 py-1 text-sm" aria-label="Età" />
      </div>
      <button className="btn-ghost w-full py-1 text-xs" disabled={loading}>
        {loading ? "Calcolo..." : "Mostra casate disponibili"}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {result && byHouse.size === 0 && <p className="text-xs text-muted">Nessuna casata disponibile.</p>}
      <ul className="space-y-2 text-xs">
        {[...byHouse].map(([house, roles]) => (
          <li key={house}>
            <span className="font-serif text-sm text-accent">{house}</span>
            <ul className="ml-2">
              {roles.map((r) => (
                <li key={r.role_id} className="text-muted">
                  {r.role_name} · {r.free_slots} post{r.free_slots === 1 ? "o" : "i"} liber{r.free_slots === 1 ? "o" : "i"}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </form>
  );
}

const TABS = [
  { id: "dati", label: "Dati" },
  { id: "ruoli", label: "Ruoli e stipendi" },
  { id: "albero", label: "Albero genealogico" },
  { id: "png", label: "PNG" },
  { id: "pg", label: "PG" },
] as const;
type Tab = (typeof TABS)[number]["id"];

function HouseEditor({
  house,
  roles,
  family,
  relations,
  npcs,
  allNpcs,
  allHouses,
  members,
  onCreated,
  onDeleted,
}: {
  house: House | null;
  roles: HouseRole[];
  family: FamilyMember[];
  relations: FamilyRelation[];
  allNpcs: HouseNpc[];
  allHouses: House[];
  npcs: HouseNpc[];
  members: HouseMember[];
  onCreated: (id: string) => void;
  onDeleted: () => void;
}) {
  const [tab, setTab] = useState<Tab>("dati");
  // Una casata nuova ha solo i dati: le altre sezioni dopo il primo salvataggio
  const tabs = house ? TABS : TABS.filter((t) => t.id === "dati");

  return (
    <section className="min-w-0 rounded-md border border-border bg-black/50">
      <div className="flex items-center gap-3 border-b border-border p-4">
        <Sigil url={house?.sigil_url ?? null} name={house?.name ?? "?"} size="h-12 w-12" />
        <h2 className="font-serif text-2xl tracking-wide text-accent">{house ? `Casata ${house.name}` : "Nuova casata"}</h2>
      </div>
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-border px-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-xs tracking-[0.12em] uppercase transition ${
              tab === t.id ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-4">
        {tab === "dati" && <DataTab house={house} onCreated={onCreated} onDeleted={onDeleted} />}
        {house && tab === "ruoli" && <RolesTab houseId={house.id} roles={roles} members={members} npcs={npcs} />}
        {house && tab === "albero" && <TreeTab houseId={house.id} family={family} relations={relations} allNpcs={allNpcs} allHouses={allHouses} />}
        {house && tab === "png" && <NpcTab houseId={house.id} npcs={npcs} roles={roles} />}
        {house && tab === "pg" && <MembersTab house={house} roles={roles} members={members} />}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------
// Dati: nome (= cognome), descrizione, stemma
// ---------------------------------------------------------------------
function DataTab({
  house,
  onCreated,
  onDeleted,
}: {
  house: House | null;
  onCreated: (id: string) => void;
  onDeleted: () => void;
}) {
  const { run, pending, feedback } = useAction();
  const [preview, setPreview] = useState<string | null>(house?.sigil_url ?? null);
  const [removeSigil, setRemoveSigil] = useState(false);
  const [history, setHistory] = useState(house?.history ?? "");
  const [playable, setPlayable] = useState(house?.playable ?? true);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (house) form.set("id", house.id);
    if (removeSigil) form.set("remove_sigil", "1");
    form.set("history", history);
    form.set("playable", playable ? "1" : "0");
    run(() => saveHouse(form), "Casata salvata.", (res) => !house && res.id && onCreated(res.id));
  }

  function remove() {
    if (!house) return;
    if (!window.confirm(`Eliminare la casata ${house.name}? Ruoli, albero e PNG verranno cancellati; i PG resteranno senza casata.`)) return;
    run(() => deleteHouse(house.id), "Casata eliminata.", onDeleted);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[1fr_auto]">
        <div className="space-y-4">
          <Field label="Nome della casata (sarà il cognome dei membri)">
            <input name="name" defaultValue={house?.name} required minLength={2} maxLength={40} className="input" />
          </Field>
          <Field label="Motto">
            <input name="motto" defaultValue={house?.motto} maxLength={200} placeholder="Es. Fuoco e sangue" className="input" />
          </Field>
          <Field label="Descrizione (breve presentazione)">
            <textarea name="description" defaultValue={house?.description} rows={5} maxLength={8000} className="input" />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={playable} onChange={(e) => setPlayable(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            Casata giocabile (PG) — compare in &quot;Casate PG&quot; nell&apos;Utility giocatore
          </label>
        </div>
        <Field label="Stemma">
          <div className="flex flex-col items-center gap-2">
            <Sigil url={removeSigil ? null : preview} name={house?.name ?? "?"} size="h-32 w-32" />
            <input
              type="file"
              name="sigil"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => {
                const file = e.target.files?.[0];
                setRemoveSigil(false);
                setPreview(file ? URL.createObjectURL(file) : (house?.sigil_url ?? null));
              }}
              className="w-56 text-xs text-muted file:mr-2 file:rounded file:border file:border-border file:bg-background file:px-2 file:py-1 file:text-foreground"
            />
            <span className="text-xs text-muted">PNG, JPG, WebP o GIF · max 1 MB</span>
            {house?.sigil_url && (
              <label className="flex items-center gap-2 text-xs text-muted">
                <input type="checkbox" checked={removeSigil} onChange={(e) => setRemoveSigil(e.target.checked)} />
                Rimuovi stemma
              </label>
            )}
          </div>
        </Field>
      </div>
      <Field label="Storia della casata">
        <RichEditor value={history} onChange={setHistory} />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={pending}>
          {pending ? "Salvataggio..." : house ? "Salva" : "Crea casata"}
        </button>
        {house && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="btn-ghost border-red-900 text-red-400 hover:border-red-500 hover:text-red-300"
          >
            Elimina casata
          </button>
        )}
        {feedback}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------
// Ruoli e stipendi
// ---------------------------------------------------------------------
function RolesTab({
  houseId,
  roles,
  members,
  npcs,
}: {
  houseId: string;
  roles: HouseRole[];
  members: HouseMember[];
  npcs: HouseNpc[];
}) {
  const total = members.reduce((sum, m) => sum + (roles.find((r) => r.id === m.house_role_id)?.daily_salary ?? 0), 0);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        I ruoli che i PG possono ricoprire in questa casata e quanto guadagnano ogni giorno (in monete).
        Spunta &quot;Disponibile all&apos;iscrizione&quot; per renderlo sceglibile durante la creazione del PG.
      </p>
      <div className="hidden grid-cols-[1fr_10rem_6rem_auto] gap-2 px-3 text-xs tracking-wider text-muted uppercase sm:grid">
        <span>Ruolo</span>
        <span>Stipendio / giorno</span>
        <span>Ordine</span>
        <span />
      </div>
      {roles.map((r) => (
        <RoleRow
          key={r.id}
          houseId={houseId}
          role={r}
          pgHolders={members.filter((m) => m.house_role_id === r.id).length}
          npcHolders={npcs.filter((n) => n.house_role_id === r.id).length}
        />
      ))}
      <RoleRow key={`nuovo-${roles.length}`} houseId={houseId} role={null} pgHolders={0} npcHolders={0} />
      <p className="pt-2 text-sm text-muted">
        Spesa giornaliera della casata per gli stipendi dei PG: <strong className="text-accent">{total} monete</strong>
      </p>
    </div>
  );
}

const toInput = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
const fromInput = (v: string) => (v.trim() === "" ? null : Number(v));

function RoleRow({
  houseId,
  role,
  pgHolders,
  npcHolders,
}: {
  houseId: string;
  role: HouseRole | null;
  pgHolders: number;
  npcHolders: number;
}) {
  const holders = pgHolders + npcHolders; // anche i PNG occupano un posto
  const holdersLabel = `${pgHolders} PG · ${npcHolders} PNG`;
  const { run, pending, feedback } = useAction();
  const [form, setForm] = useState({
    name: role?.name ?? "",
    salary: String(role?.daily_salary ?? 0),
    order: String(role?.sort_order ?? 0),
    signup: role?.signup_available ?? false,
    maxMembers: toInput(role?.max_members),
    sex: role?.required_sex ?? "",
    minAge: toInput(role?.min_age),
    maxAge: toInput(role?.max_age),
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  function save(e: FormEvent) {
    e.preventDefault();
    run(
      () =>
        saveHouseRole({
          id: role?.id,
          house_id: houseId,
          name: form.name,
          daily_salary: Number(form.salary),
          sort_order: Number(form.order),
          signup_available: form.signup,
          max_members: fromInput(form.maxMembers),
          required_sex: form.sex || null,
          min_age: fromInput(form.minAge),
          max_age: fromInput(form.maxAge),
        }),
      role ? "Ruolo salvato." : "Ruolo aggiunto.",
    );
  }

  function remove() {
    if (!role) return;
    if (holders > 0 && !window.confirm(`Il ruolo "${role.name}" è ricoperto (${holdersLabel}): resteranno nella casata senza ruolo. Eliminare?`)) return;
    run(() => deleteHouseRole(role.id), "Ruolo eliminato.");
  }

  const full = role?.signup_available && role.max_members !== null && holders >= role.max_members;

  return (
    <form onSubmit={save} className={`rounded-md border p-3 ${role ? "border-border/60" : "border-dashed border-accent/50"}`}>
      <div className="grid items-center gap-2 sm:grid-cols-[1fr_10rem_6rem_auto]">
        <input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder={role ? "" : "Nuovo ruolo (es. Maestro d'armi)"} maxLength={40} className="input py-1.5" aria-label="Nome del ruolo" />
        <input type="number" min={0} max={1000000} value={form.salary} onChange={(e) => set({ salary: e.target.value })} className="input py-1.5" aria-label="Stipendio giornaliero" />
        <input type="number" value={form.order} onChange={(e) => set({ order: e.target.value })} className="input py-1.5" aria-label="Ordine" />
        <div className="flex gap-2">
          <button className="btn px-3 py-1.5 text-sm" disabled={pending || !form.name.trim()}>
            {role ? "Salva" : "Aggiungi"}
          </button>
          {role && (
            <button type="button" onClick={remove} disabled={pending} className="btn-ghost px-3 py-1.5 text-sm text-red-400" aria-label={`Elimina ${role.name}`}>
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Disponibilita' all'iscrizione */}
      <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 py-1.5 text-sm">
          <input type="checkbox" checked={form.signup} onChange={(e) => set({ signup: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
          Disponibile all&apos;iscrizione
        </label>
        {form.signup && (
          <>
            <MiniField label="Max PG">
              <input type="number" min={1} max={1000} required value={form.maxMembers} onChange={(e) => set({ maxMembers: e.target.value })} className="input w-24 py-1" />
            </MiniField>
            <MiniField label="Sesso">
              <select value={form.sex} onChange={(e) => set({ sex: e.target.value as typeof form.sex })} className="input w-32 py-1">
                <option value="">Qualsiasi</option>
                <option value="uomo">Uomo</option>
                <option value="donna">Donna</option>
              </select>
            </MiniField>
            <MiniField label={`Età min (${AGE_MIN}+)`}>
              <input type="number" min={AGE_MIN} max={AGE_MAX} value={form.minAge} onChange={(e) => set({ minAge: e.target.value })} placeholder="—" className="input w-24 py-1" />
            </MiniField>
            <MiniField label={`Età max (≤${AGE_MAX})`}>
              <input type="number" min={AGE_MIN} max={AGE_MAX} value={form.maxAge} onChange={(e) => set({ maxAge: e.target.value })} placeholder="—" className="input w-24 py-1" />
            </MiniField>
          </>
        )}
      </div>

      {role && (
        <p className="mt-2 text-xs text-muted">
          {role.signup_available && role.max_members !== null ? (
            <>
              Posti occupati: <strong className={full ? "text-red-400" : "text-foreground"}>{holders}/{role.max_members}</strong> ({holdersLabel})
              {full && " — completo, non compare più all'iscrizione"}
            </>
          ) : (
            <>{holdersLabel} con questo ruolo · non disponibile all&apos;iscrizione</>
          )}
        </p>
      )}
      {feedback && <div className="mt-1">{feedback}</div>}
    </form>
  );
}

function MiniField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[10px] tracking-wider text-muted uppercase">{label}</span>
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------
// Albero genealogico: genitori (fino a due) e rapporti tra membri
// ---------------------------------------------------------------------
function TreeTab({
  houseId,
  family,
  relations,
  allNpcs,
  allHouses,
}: {
  houseId: string;
  family: FamilyMember[];
  relations: FamilyRelation[];
  allNpcs: HouseNpc[];
  allHouses: House[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [layoutVersion, setLayoutVersion] = useState(0); // cambia per scartare gli spostamenti locali
  const editing = family.find((f) => f.id === editingId) ?? null;
  const tree = buildTree(family, relations, allNpcs, allHouses, houseId);

  return (
    <div className="space-y-5">
      {/* Legenda */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="rounded-full border border-border px-2 py-0.5">† deceduto</span>
        {Object.values(RELATION_KINDS).map((k) => (
          <span key={k.label} className="rounded-full border border-border px-2 py-0.5">
            <span className="text-accent">{k.symbol}</span> {k.label.toLowerCase()}
          </span>
        ))}
        <span className="rounded-full border border-sky-700/60 px-2 py-0.5">bordo azzurro = PNG di un&apos;altra casata</span>
        <span className="ml-auto">Clicca una persona per modificarla · trascinala per spostarla</span>
      </div>

      {/* Albero: carte trascinabili, linee calcolate da genitori e rapporti; se e' grande si scorre */}
      <div className="max-h-[70vh] overflow-auto rounded-md border border-border/60 bg-[radial-gradient(ellipse_at_top,#1d1512_0%,transparent_70%)]">
        {tree.roots.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            L&apos;albero è vuoto: aggiungi il capostipite con il modulo qui sotto.
          </p>
        ) : (
          <FamilyCanvas
            key={layoutVersion}
            tree={tree}
            family={family}
            selectedId={editingId}
            onSelect={setEditingId}
            onMove={(id, x, y) => saveTreePosition(id, x, y)}
          />
        )}
      </div>
      {family.some((f) => f.pos_x !== null) && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() =>
              window.confirm("Rimettere tutte le carte nella disposizione automatica?") &&
              resetTreePositions(houseId).then(() => {
                setLayoutVersion((v) => v + 1);
                router.refresh();
              })
            }
            className="btn-ghost px-3 py-1.5 text-xs tracking-wider uppercase"
          >
            ↺ Disposizione automatica
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <FamilyForm
          key={editingId ?? `nuovo-${family.length}`}
          houseId={houseId}
          member={editing}
          family={family}
          allNpcs={allNpcs}
          allHouses={allHouses}
          onDone={() => setEditingId(null)}
        />
        <RelationsForm houseId={houseId} family={family} relations={relations} />
      </div>
    </div>
  );
}

function FamilyForm({
  houseId,
  member,
  family,
  allNpcs,
  allHouses,
  onDone,
}: {
  houseId: string;
  member: FamilyMember | null;
  family: FamilyMember[];
  allNpcs: HouseNpc[];
  allHouses: House[];
  onDone: () => void;
}) {
  const { run, pending, feedback } = useAction();
  const [mode, setMode] = useState<"png" | "nome">(member && !member.npc_id ? "nome" : "png");
  const [form, setForm] = useState({
    npc_id: member?.npc_id ?? "",
    name: member?.name ?? "",
    parent_id: member?.parent_id ?? "",
    parent2_id: member?.parent2_id ?? "",
    spouse: member?.spouse ?? "",
    note: member?.note ?? "",
    deceased: member?.deceased ?? false,
    birth_year: member?.birth_year === null || member?.birth_year === undefined ? "" : String(member.birth_year),
    death_year: member?.death_year === null || member?.death_year === undefined ? "" : String(member.death_year),
  });
  const others = family.filter((f) => f.id !== member?.id).sort(byOrder);
  const yearOf = (v: string) => (v.trim() === "" ? null : Number(v));

  // PNG sceglibili, raggruppati per casata (prima questa); esclusi quelli gia' nell'albero
  const usedNpcs = new Set(family.filter((f) => f.id !== member?.id && f.npc_id).map((f) => f.npc_id));
  const npcGroups = [...allHouses]
    .sort((a, b) => (a.id === houseId ? -1 : b.id === houseId ? 1 : a.name.localeCompare(b.name)))
    .map((h) => ({
      house: h,
      npcs: allNpcs.filter((n) => n.house_id === h.id && !usedNpcs.has(n.id)).sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter((g) => g.npcs.length > 0);

  function submit(e: FormEvent) {
    e.preventDefault();
    run(
      () =>
        saveFamilyMember({
          id: member?.id,
          house_id: houseId,
          npc_id: mode === "png" ? form.npc_id || null : null,
          name: form.name,
          parent_id: form.parent_id || null,
          parent2_id: form.parent2_id || null,
          spouse: form.spouse,
          note: form.note,
          deceased: form.deceased,
          birth_year: yearOf(form.birth_year),
          death_year: form.deceased ? yearOf(form.death_year) : null,
        }),
      member ? "Membro salvato." : "Membro aggiunto.",
      onDone,
    );
  }

  // Genitore: una persona di questo albero oppure un PNG di qualunque casata non ancora
  // nell'albero ("npc:<id>"), che verra' aggiunto automaticamente
  const parentSelect = (key: "parent_id" | "parent2_id") => (
    <select value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="input py-1.5">
      <option value="">— Nessuno —</option>
      {others.length > 0 && (
        <optgroup label="In questo albero">
          {others.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </optgroup>
      )}
      {npcGroups.map((g) => (
        <optgroup key={g.house.id} label={`PNG · Casata ${g.house.name}`}>
          {g.npcs
            .filter((n) => n.id !== form.npc_id)
            .map((n) => (
              <option key={n.id} value={`npc:${n.id}`}>
                {n.name}
                {n.title ? ` — ${n.title}` : ""}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );

  return (
    <form onSubmit={submit} className="h-fit space-y-3 rounded-md border border-border bg-background/60 p-3">
      <h3 className="font-serif text-lg text-accent">{member ? "Modifica membro" : "Aggiungi membro"}</h3>
      {/* Chi e': un PNG gia' esistente (anche di altre casate) oppure un nome scritto a mano */}
      <div className="flex gap-1 rounded-md border border-border p-1 text-xs">
        {(
          [
            ["png", "PNG esistente"],
            ["nome", "Scrivi il nome"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={`flex-1 rounded px-2 py-1 tracking-wider uppercase transition ${
              mode === id ? "bg-blood/40 text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "png" ? (
        <Field label="PNG">
          <select
            value={form.npc_id}
            onChange={(e) => setForm({ ...form, npc_id: e.target.value })}
            required
            className="input py-1.5"
          >
            <option value="">— Scegli un PNG —</option>
            {npcGroups.map((g) => (
              <optgroup key={g.house.id} label={g.house.id === houseId ? `Casata ${g.house.name} (questa)` : `Casata ${g.house.name}`}>
                {g.npcs.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                    {n.title ? ` — ${n.title}` : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {npcGroups.length === 0 && (
            <span className="mt-1 block text-xs text-muted">Nessun PNG disponibile: creali nella scheda PNG di una casata.</span>
          )}
        </Field>
      ) : (
        <Field label="Nome">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} required className="input py-1.5" />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Genitore 1">{parentSelect("parent_id")}</Field>
        <Field label="Genitore 2">{parentSelect("parent2_id")}</Field>
      </div>
      <Field label="Coniuge non presente nell'albero">
        <input
          value={form.spouse}
          onChange={(e) => setForm({ ...form, spouse: e.target.value })}
          maxLength={80}
          placeholder="Solo se non è un membro dell'albero"
          className="input py-1.5"
        />
      </Field>
      <Field label="Nota">
        <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={200} placeholder="Es. Lord di Grande Inverno" className="input py-1.5" />
      </Field>
      {mode === "png" ? (
        <p className="text-xs text-muted">Nascita, morte e &quot;deceduto&quot; vengono dalla scheda del PNG.</p>
      ) : (
        <LifeFields
          birth={form.birth_year}
          death={form.death_year}
          deceased={form.deceased}
          onChange={(patch) => setForm({ ...form, ...patch })}
        />
      )}
      <div className="flex flex-wrap gap-2">
        <button className="btn px-3 py-1.5 text-sm" disabled={pending}>
          {member ? "Salva" : "Aggiungi"}
        </button>
        {member && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                window.confirm(
                  `Togliere ${member.name} dall'albero? I figli resteranno senza questo genitore e i suoi rapporti verranno cancellati.`,
                ) && run(() => deleteFamilyMember(member.id), "Membro eliminato.", onDone)
              }
              className="btn-ghost px-3 py-1.5 text-sm text-red-400"
            >
              Elimina
            </button>
            <button type="button" onClick={onDone} className="btn-ghost px-3 py-1.5 text-sm">
              Annulla
            </button>
          </>
        )}
      </div>
      {feedback}
    </form>
  );
}

// Anno di nascita, "deceduto" e anno di morte (D.C.); i nomi servono ai moduli dei PNG
function LifeFields({
  birth,
  death,
  deceased,
  onChange,
}: {
  birth: string;
  death: string;
  deceased: boolean;
  onChange: (patch: { birth_year?: string; death_year?: string; deceased?: boolean }) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Anno di nascita">
        <span className="flex items-center gap-1.5">
          <input
            type="number"
            name="birth_year"
            min={YEAR_MIN}
            max={YEAR_MAX}
            value={birth}
            onChange={(e) => onChange({ birth_year: e.target.value })}
            placeholder="es. 312"
            className="input w-24 py-1.5"
          />
          <span className="text-sm text-muted">D.C.</span>
        </span>
      </Field>
      <label className="flex items-center gap-2 py-2 text-sm">
        <input
          type="checkbox"
          name="deceased"
          value="1"
          checked={deceased}
          onChange={(e) => onChange({ deceased: e.target.checked })}
          className="accent-[var(--accent)]"
        />
        Deceduto
      </label>
      {deceased && (
        <Field label="Anno di morte">
          <span className="flex items-center gap-1.5">
            <input
              type="number"
              name="death_year"
              min={YEAR_MIN}
              max={YEAR_MAX}
              value={death}
              onChange={(e) => onChange({ death_year: e.target.value })}
              placeholder="es. 350"
              className="input w-24 py-1.5"
            />
            <span className="text-sm text-muted">D.C.</span>
          </span>
        </Field>
      )}
    </div>
  );
}

function RelationsForm({
  houseId,
  family,
  relations,
}: {
  houseId: string;
  family: FamilyMember[];
  relations: FamilyRelation[];
}) {
  const { run, pending, feedback } = useAction();
  const [form, setForm] = useState({ member_a: "", kind: "matrimonio" as RelationKind, member_b: "", note: "" });
  const sorted = [...family].sort(byOrder);
  const name = (id: string) => family.find((f) => f.id === id)?.name ?? "?";

  function submit(e: FormEvent) {
    e.preventDefault();
    run(
      () => saveRelation({ house_id: houseId, ...form }),
      "Rapporto aggiunto.",
      () => setForm({ ...form, member_a: "", member_b: "", note: "" }),
    );
  }

  const memberSelect = (key: "member_a" | "member_b") => (
    <select value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} required className="input py-1.5">
      <option value="">— Scegli —</option>
      {sorted.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-3 rounded-md border border-border bg-background/60 p-3">
      <h3 className="font-serif text-lg text-accent">Rapporti</h3>
      {family.length < 2 ? (
        <p className="text-sm text-muted">Servono almeno due membri nell&apos;albero.</p>
      ) : (
        <form onSubmit={submit} className="space-y-2">
          {memberSelect("member_a")}
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as RelationKind })} className="input py-1.5">
            {Object.entries(RELATION_KINDS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.symbol} {v.label}
              </option>
            ))}
          </select>
          {memberSelect("member_b")}
          <input
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            maxLength={120}
            placeholder="Nota (facoltativa)"
            className="input py-1.5"
          />
          <button className="btn w-full py-1.5 text-sm" disabled={pending}>
            Aggiungi rapporto
          </button>
        </form>
      )}
      {feedback}
      {relations.length > 0 && (
        <ul className="space-y-1 border-t border-border pt-2 text-sm">
          {relations.map((r) => (
            <li key={r.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1">
                {name(r.member_a)} <span className="text-accent">{RELATION_KINDS[r.kind].symbol}</span> {name(r.member_b)}
                {r.note && <span className="block text-xs text-muted">{r.note}</span>}
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => deleteRelation(r.id), "Rapporto eliminato.")}
                aria-label="Elimina rapporto"
                className="text-muted hover:text-red-400"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// PNG di casata
// ---------------------------------------------------------------------
function NpcTab({ houseId, npcs, roles }: { houseId: string; npcs: HouseNpc[]; roles: HouseRole[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = npcs.find((n) => n.id === editingId) ?? null;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
      <ul className="grid h-fit gap-3 sm:grid-cols-2">
        {npcs.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => setEditingId(n.id)}
              className={`flex w-full gap-3 rounded-md border p-3 text-left transition hover:border-accent ${
                n.id === editingId ? "border-accent bg-accent/10" : "border-border bg-background"
              }`}
            >
              <Sigil url={n.image_url} name={n.name} size="h-16 w-16" />
              <span className="min-w-0">
                <span className="block truncate font-serif text-accent">
                  {n.name}
                  {n.deceased && <span className="ml-1 text-muted">†</span>}
                </span>
                {lifeLabel(n, GAME_YEAR) && <span className="block text-[11px] text-foreground/70">{lifeLabel(n, GAME_YEAR)}</span>}
                {(n.house_role_id || n.title) && (
                  <span className="block text-xs text-muted">
                    {[roles.find((r) => r.id === n.house_role_id)?.name, n.title].filter(Boolean).join(" · ")}
                  </span>
                )}
                <span className="mt-1 line-clamp-2 block text-xs">{n.description}</span>
              </span>
            </button>
          </li>
        ))}
        {npcs.length === 0 && <li className="text-sm text-muted">Nessun PNG in questa casata.</li>}
      </ul>
      <NpcForm
        key={editingId ?? `nuovo-${npcs.length}`}
        houseId={houseId}
        npc={editing}
        roles={roles}
        onDone={() => setEditingId(null)}
      />
    </div>
  );
}

function NpcForm({
  houseId,
  npc,
  roles,
  onDone,
}: {
  houseId: string;
  npc: HouseNpc | null;
  roles: HouseRole[];
  onDone: () => void;
}) {
  const { run, pending, feedback } = useAction();
  const [preview, setPreview] = useState<string | null>(npc?.image_url ?? null);
  const [life, setLife] = useState({
    birth_year: npc?.birth_year === null || npc?.birth_year === undefined ? "" : String(npc.birth_year),
    death_year: npc?.death_year === null || npc?.death_year === undefined ? "" : String(npc.death_year),
    deceased: npc?.deceased ?? false,
  });

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    form.set("house_id", houseId);
    if (npc) form.set("id", npc.id);
    run(() => saveNpc(form), npc ? "PNG salvato." : "PNG aggiunto.", onDone);
  }

  return (
    <form onSubmit={submit} className="h-fit space-y-3 rounded-md border border-border bg-background/60 p-3">
      <h3 className="font-serif text-lg text-accent">{npc ? "Modifica PNG" : "Aggiungi PNG"}</h3>
      <div className="flex items-center gap-3">
        <Sigil url={preview} name={npc?.name ?? "?"} size="h-16 w-16" />
        <input
          type="file"
          name="image"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(e) => {
            const file = e.target.files?.[0];
            setPreview(file ? URL.createObjectURL(file) : (npc?.image_url ?? null));
          }}
          className="min-w-0 text-xs text-muted file:mr-2 file:rounded file:border file:border-border file:bg-background file:px-2 file:py-1 file:text-foreground"
        />
      </div>
      {npc?.image_url && (
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" name="remove_image" value="1" />
          Rimuovi ritratto
        </label>
      )}
      <Field label="Nome">
        <input name="name" defaultValue={npc?.name} maxLength={80} required className="input py-1.5" />
      </Field>
      <Field label="Ruolo di casata">
        <select name="house_role_id" defaultValue={npc?.house_role_id ?? ""} className="input py-1.5">
          <option value="">— Nessun ruolo —</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.daily_salary}/giorno)
            </option>
          ))}
        </select>
        {roles.length === 0 && (
          <span className="mt-1 block text-xs text-muted">Crea i ruoli nella scheda &quot;Ruoli e stipendi&quot;.</span>
        )}
      </Field>
      <LifeFields
        birth={life.birth_year}
        death={life.death_year}
        deceased={life.deceased}
        onChange={(patch) => setLife({ ...life, ...patch })}
      />
      <Field label="Titolo (facoltativo)">
        <input name="title" defaultValue={npc?.title} maxLength={80} placeholder="Es. Signore di Driftmark" className="input py-1.5" />
      </Field>
      <Field label="Descrizione">
        <textarea name="description" defaultValue={npc?.description} rows={4} maxLength={4000} className="input" />
      </Field>
      <div className="flex flex-wrap gap-2">
        <button className="btn px-3 py-1.5 text-sm" disabled={pending}>
          {npc ? "Salva" : "Aggiungi"}
        </button>
        {npc && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => window.confirm(`Eliminare il PNG ${npc.name}?`) && run(() => deleteNpc(npc.id), "PNG eliminato.", onDone)}
              className="btn-ghost px-3 py-1.5 text-sm text-red-400"
            >
              Elimina
            </button>
            <button type="button" onClick={onDone} className="btn-ghost px-3 py-1.5 text-sm">
              Annulla
            </button>
          </>
        )}
      </div>
      {feedback}
    </form>
  );
}

// ---------------------------------------------------------------------
// PG membri della casata
// ---------------------------------------------------------------------
function MembersTab({ house, roles, members }: { house: House; roles: HouseRole[]; members: HouseMember[] }) {
  const { run, pending, feedback } = useAction();
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState("");

  function add(e: FormEvent) {
    e.preventDefault();
    run(() => addMember(house.id, name, roleId || null), "PG aggiunto alla casata.", () => setName(""));
  }

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-accent/50 p-3">
        <Field label="Aggiungi un PG (nome)">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome del personaggio" className="input w-56 py-1.5" />
        </Field>
        <Field label="Ruolo">
          <select value={roleId} onChange={(e) => setRoleId(e.target.value)} className="input w-56 py-1.5">
            <option value="">— Nessun ruolo —</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.daily_salary}/giorno)
              </option>
            ))}
          </select>
        </Field>
        <button className="btn px-4 py-1.5 text-sm" disabled={pending || !name.trim()}>
          Aggiungi
        </button>
      </form>
      {feedback}

      <ul className="divide-y divide-border/60">
        {members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 py-2">
            <Sigil url={house.sigil_url} name={house.name} size="h-8 w-8" />
            <span className="min-w-40 flex-1 font-serif">
              {m.name} <span className="text-accent">{house.name}</span>
              {m.status !== "attivo" && <span className="ml-2 text-xs text-orange-300">(PG non attivo)</span>}
            </span>
            <select
              value={m.house_role_id ?? ""}
              disabled={pending}
              onChange={(e) => run(() => setMemberRole(m.id, house.id, e.target.value || null), "Ruolo aggiornato.")}
              className="input w-56 py-1.5 text-sm"
            >
              <option value="">— Nessun ruolo —</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.daily_salary}/giorno)
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={pending}
              onClick={() => window.confirm(`Togliere ${m.name} dalla casata ${house.name}?`) && run(() => removeMember(m.id), "PG rimosso.")}
              className="btn-ghost px-3 py-1.5 text-sm text-red-400"
            >
              Rimuovi
            </button>
          </li>
        ))}
        {members.length === 0 && <li className="py-2 text-sm text-muted">Nessun PG in questa casata.</li>}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------
function Sigil({ url, name, size }: { url: string | null; name: string; size: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className={`${size} shrink-0 rounded object-contain`} />
  ) : (
    <span className={`${size} flex shrink-0 items-center justify-center rounded border border-border bg-background font-serif text-muted`}>
      {name[0]}
    </span>
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
