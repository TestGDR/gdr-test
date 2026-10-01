"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { AGE_MAX, AGE_MIN } from "@/lib/character-creation";
import type { FamilyMember, House, HouseMember, HouseNpc, HouseRole, SignupRole } from "@/lib/houses";
import { createClient } from "@/lib/supabase/client";
import {
  addMember,
  deleteFamilyMember,
  deleteHouse,
  deleteHouseRole,
  deleteNpc,
  removeMember,
  saveFamilyMember,
  saveHouse,
  saveHouseRole,
  saveNpc,
  setMemberRole,
  type HouseResult,
} from "./actions";

type Data = {
  houses: House[];
  roles: HouseRole[];
  family: FamilyMember[];
  npcs: HouseNpc[];
  members: HouseMember[];
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

export default function HousesManager(data: Data) {
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
        npcs={data.npcs.filter((n) => n.house_id === house?.id)}
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
  npcs,
  members,
  onCreated,
  onDeleted,
}: {
  house: House | null;
  roles: HouseRole[];
  family: FamilyMember[];
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
        {house && tab === "ruoli" && <RolesTab houseId={house.id} roles={roles} members={members} />}
        {house && tab === "albero" && <TreeTab houseId={house.id} family={family} />}
        {house && tab === "png" && <NpcTab houseId={house.id} npcs={npcs} />}
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

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (house) form.set("id", house.id);
    if (removeSigil) form.set("remove_sigil", "1");
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
          <Field label="Descrizione">
            <textarea name="description" defaultValue={house?.description} rows={8} maxLength={8000} className="input" />
          </Field>
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
function RolesTab({ houseId, roles, members }: { houseId: string; roles: HouseRole[]; members: HouseMember[] }) {
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
        <RoleRow key={r.id} houseId={houseId} role={r} holders={members.filter((m) => m.house_role_id === r.id).length} />
      ))}
      <RoleRow key={`nuovo-${roles.length}`} houseId={houseId} role={null} holders={0} />
      <p className="pt-2 text-sm text-muted">
        Spesa giornaliera della casata per gli stipendi dei PG: <strong className="text-accent">{total} monete</strong>
      </p>
    </div>
  );
}

const toInput = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
const fromInput = (v: string) => (v.trim() === "" ? null : Number(v));

function RoleRow({ houseId, role, holders }: { houseId: string; role: HouseRole | null; holders: number }) {
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
    if (holders > 0 && !window.confirm(`${holders} PG hanno il ruolo "${role.name}": resteranno nella casata senza ruolo. Eliminare?`)) return;
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
              Posti occupati: <strong className={full ? "text-red-400" : "text-foreground"}>{holders}/{role.max_members}</strong>
              {full && " — completo, non compare più all'iscrizione"}
            </>
          ) : (
            <>{holders} PG con questo ruolo · non disponibile all&apos;iscrizione</>
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
// Albero genealogico
// ---------------------------------------------------------------------
function TreeTab({ houseId, family }: { houseId: string; family: FamilyMember[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = family.find((f) => f.id === editingId) ?? null;

  const roots = childrenOf(family, null);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0 overflow-x-auto">
        {roots.length === 0 ? (
          <p className="text-sm text-muted">L&apos;albero è vuoto: aggiungi il capostipite con il modulo.</p>
        ) : (
          <ul>
            {roots.map((r) => (
              <TreeNode key={r.id} member={r} family={family} selectedId={editingId} onSelect={setEditingId} />
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted">Clicca un membro per modificarlo. † = deceduto · ∞ = coniuge</p>
      </div>
      <FamilyForm
        key={editingId ?? `nuovo-${family.length}`}
        houseId={houseId}
        member={editing}
        family={family}
        onDone={() => setEditingId(null)}
      />
    </div>
  );
}

// Figli diretti; con id = null i capostipiti (anche chi ha un genitore non piu' esistente)
function childrenOf(family: FamilyMember[], id: string | null) {
  return family.filter(
    (f) => (f.parent_id ?? null) === id || (id === null && f.parent_id && !family.some((p) => p.id === f.parent_id)),
  );
}

function TreeNode({
  member,
  family,
  selectedId,
  onSelect,
}: {
  member: FamilyMember;
  family: FamilyMember[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const kids = childrenOf(family, member.id);
  return (
    <li className="relative pl-5 before:absolute before:top-0 before:left-0 before:h-4 before:w-4 before:border-b before:border-l before:border-accent/40">
      <button
        type="button"
        onClick={() => onSelect(member.id)}
        className={`my-1 inline-flex flex-col rounded border px-3 py-1.5 text-left transition hover:border-accent ${
          member.id === selectedId ? "border-accent bg-accent/10" : "border-border bg-background"
        }`}
      >
        <span className={`font-serif ${member.deceased ? "text-muted" : "text-foreground"}`}>
          {member.name}
          {member.deceased && " †"}
        </span>
        {member.spouse && <span className="text-xs text-muted">∞ {member.spouse}</span>}
        {member.note && <span className="text-xs text-muted italic">{member.note}</span>}
      </button>
      {kids.length > 0 && (
        <ul className="ml-3 border-l border-accent/40">
          {kids.map((k) => (
            <TreeNode key={k.id} member={k} family={family} selectedId={selectedId} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  );
}

function FamilyForm({
  houseId,
  member,
  family,
  onDone,
}: {
  houseId: string;
  member: FamilyMember | null;
  family: FamilyMember[];
  onDone: () => void;
}) {
  const { run, pending, feedback } = useAction();
  const [form, setForm] = useState({
    name: member?.name ?? "",
    parent_id: member?.parent_id ?? "",
    spouse: member?.spouse ?? "",
    note: member?.note ?? "",
    deceased: member?.deceased ?? false,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    run(
      () => saveFamilyMember({ id: member?.id, house_id: houseId, ...form, parent_id: form.parent_id || null }),
      member ? "Membro salvato." : "Membro aggiunto.",
      onDone,
    );
  }

  return (
    <form onSubmit={submit} className="h-fit space-y-3 rounded-md border border-border bg-background/60 p-3">
      <h3 className="font-serif text-lg text-accent">{member ? "Modifica membro" : "Aggiungi membro"}</h3>
      <Field label="Nome">
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} required className="input py-1.5" />
      </Field>
      <Field label="Figlio/a di">
        <select value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })} className="input py-1.5">
          <option value="">— Capostipite (nessun genitore) —</option>
          {family
            .filter((f) => f.id !== member?.id)
            .map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Coniuge">
        <input value={form.spouse} onChange={(e) => setForm({ ...form, spouse: e.target.value })} maxLength={80} className="input py-1.5" />
      </Field>
      <Field label="Nota">
        <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={200} placeholder="Es. Lord di Grande Inverno" className="input py-1.5" />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.deceased} onChange={(e) => setForm({ ...form, deceased: e.target.checked })} className="accent-[var(--accent)]" />
        Deceduto
      </label>
      <div className="flex flex-wrap gap-2">
        <button className="btn px-3 py-1.5 text-sm" disabled={pending}>
          {member ? "Salva" : "Aggiungi"}
        </button>
        {member && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => window.confirm(`Togliere ${member.name} dall'albero? I suoi figli saliranno di un livello.`) && run(() => deleteFamilyMember(member.id), "Membro eliminato.", onDone)}
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
// PNG di casata
// ---------------------------------------------------------------------
function NpcTab({ houseId, npcs }: { houseId: string; npcs: HouseNpc[] }) {
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
                <span className="block truncate font-serif text-accent">{n.name}</span>
                {n.title && <span className="block text-xs text-muted">{n.title}</span>}
                <span className="mt-1 line-clamp-2 block text-xs">{n.description}</span>
              </span>
            </button>
          </li>
        ))}
        {npcs.length === 0 && <li className="text-sm text-muted">Nessun PNG in questa casata.</li>}
      </ul>
      <NpcForm key={editingId ?? `nuovo-${npcs.length}`} houseId={houseId} npc={editing} onDone={() => setEditingId(null)} />
    </div>
  );
}

function NpcForm({ houseId, npc, onDone }: { houseId: string; npc: HouseNpc | null; onDone: () => void }) {
  const { run, pending, feedback } = useAction();
  const [preview, setPreview] = useState<string | null>(npc?.image_url ?? null);

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
      <Field label="Ruolo / titolo">
        <input name="title" defaultValue={npc?.title} maxLength={80} placeholder="Es. Maestro della casata" className="input py-1.5" />
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
