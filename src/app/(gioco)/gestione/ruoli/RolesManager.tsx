"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { PERMISSION_SECTIONS } from "@/lib/permissions";
import { ADMIN_CHOICE, PLAYER_CHOICE } from "@/lib/role-choices";
import type { StaffRole } from "@/lib/staff";
import { assignRole, deleteRole, saveRole, type RoleInput } from "./actions";

export type UserRow = { id: string; username: string | null; role: string; staff_role_id: string | null };

type Props = { roles: StaffRole[]; users: UserRow[]; currentIsAdmin: boolean; currentUserId: string };

const ADMIN_COLOR = "#e2622d";
const TABS = [
  { id: "ruoli", label: "Ruoli" },
  { id: "staffer", label: "Staffer" },
  { id: "assegna", label: "Assegna" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function RolesManager(props: Props) {
  const [tab, setTab] = useState<Tab>("ruoli");

  return (
    <div>
      <div role="tablist" className="mb-5 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 font-serif text-sm tracking-[0.15em] uppercase transition ${
              tab === t.id ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "ruoli" && <RolesTab roles={props.roles} users={props.users} />}
      {tab === "staffer" && <StaffTab roles={props.roles} users={props.users} />}
      {tab === "assegna" && <AssignTab {...props} />}
    </div>
  );
}

// ---------------------------------------------------------------------
// TAB 1 - Ruoli: crea, modifica, elimina
// ---------------------------------------------------------------------
const SYS_ADMIN = "__sys_admin";
const NEW = "__nuovo";

function RolesTab({ roles, users }: { roles: StaffRole[]; users: UserRow[] }) {
  const [selectedId, setSelectedId] = useState<string>(SYS_ADMIN);
  const selected = roles.find((r) => r.id === selectedId) ?? null;

  const countFor = (role: StaffRole | "admin") =>
    users.filter((u) =>
      role === "admin"
        ? u.role === "admin"
        : role.system_key === "giocatore"
          ? u.role !== "admin" && !u.staff_role_id
          : u.role !== "admin" && u.staff_role_id === role.id,
    ).length;

  const item = (id: string, label: string, color: string, count: number, locked?: boolean) => (
    <li key={id}>
      <button
        type="button"
        onClick={() => setSelectedId(id)}
        className={`flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm transition hover:bg-blood/20 ${
          id === selectedId ? "bg-blood/30" : ""
        }`}
      >
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />
        <span className="flex-1 truncate">
          {label}
          {locked && <span className="ml-1 text-xs">🔒</span>}
        </span>
        <span className="text-xs text-muted" title="Utenti con questo ruolo">
          {count}
        </span>
      </button>
    </li>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
      <aside className="h-fit rounded-md border border-border bg-black/50 p-3">
        <ul className="space-y-1">
          {item(SYS_ADMIN, "Admin", ADMIN_COLOR, countFor("admin"), true)}
          {roles.map((r) => item(r.id, r.name, r.color, countFor(r)))}
        </ul>
        <button
          type="button"
          onClick={() => setSelectedId(NEW)}
          className={`btn-ghost mt-3 w-full text-sm ${selectedId === NEW ? "border-accent text-accent" : ""}`}
        >
          + Nuovo ruolo
        </button>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          🔒 Admin non si può modificare né eliminare. Giocatore si può modificare (i suoi permessi
          valgono per tutti) ma non eliminare.
        </p>
      </aside>

      {selectedId === SYS_ADMIN ? (
        <AdminView />
      ) : (
        // Il key fa ripartire il modulo da zero quando cambi ruolo (e quando un ruolo
        // appena creato arriva dal server)
        <RoleEditor
          key={`${selectedId}-${selected ? "pronto" : "attesa"}`}
          role={selected}
          onSaved={(id) => setSelectedId(id)}
          onDeleted={() => setSelectedId(SYS_ADMIN)}
        />
      )}
    </div>
  );
}

function PermissionGrid({
  has,
  onChange,
  readOnly,
}: {
  has: (key: string) => boolean;
  onChange?: (keys: string[], on: boolean) => void;
  readOnly?: boolean;
}) {
  return (
    <>
      {PERMISSION_SECTIONS.map((section) => {
        const keys = section.items.map((i) => i.key);
        return (
          <div key={section.id} className={`rounded-md border border-border bg-black/50 p-4 ${readOnly ? "opacity-80" : ""}`}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h3 className="font-serif text-lg tracking-wide text-accent uppercase">
                  {section.title}{" "}
                  <span className="text-xs text-muted normal-case">
                    {keys.filter(has).length}/{keys.length}
                  </span>
                </h3>
                <p className="text-xs text-muted">{section.description}</p>
              </div>
              {!readOnly && onChange && (
                <div className="flex gap-3 text-xs tracking-widest uppercase">
                  <button type="button" onClick={() => onChange(keys, true)} className="text-accent hover:underline">
                    Tutti
                  </button>
                  <button type="button" onClick={() => onChange(keys, false)} className="text-muted hover:underline">
                    Nessuno
                  </button>
                </div>
              )}
            </div>
            <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {section.items.map((item) => (
                <li key={item.key}>
                  <label className={`flex items-start gap-2 ${readOnly ? "" : "cursor-pointer"}`}>
                    <input
                      type="checkbox"
                      checked={has(item.key)}
                      disabled={readOnly}
                      onChange={(e) => onChange?.([item.key], e.target.checked)}
                      className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
                    />
                    <span>
                      <span className="block text-sm">
                        {item.label}
                        {item.soon && (
                          <span className="ml-1.5 rounded border border-border px-1 text-[10px] tracking-wider text-muted uppercase">
                            in arrivo
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-muted">{item.description}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </>
  );
}

function AdminView() {
  return (
    <section className="space-y-4">
      <div className="rounded-md border border-border bg-black/50 p-4">
        <h2 className="font-serif text-xl text-accent">Admin 🔒</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Ruolo di sistema: ha sempre TUTTI i permessi, compresi quelli che verranno aggiunti in
          futuro. Non si può modificare né eliminare. Solo un admin può nominare o togliere un altro
          admin, e deve sempre restarne almeno uno.
        </p>
      </div>
      <PermissionGrid has={() => true} readOnly />
    </section>
  );
}

function RoleEditor({
  role,
  onSaved,
  onDeleted,
}: {
  role: StaffRole | null;
  onSaved: (id: string) => void;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const isPlayerRole = role?.system_key === "giocatore";
  const [draft, setDraft] = useState<RoleInput>({
    id: role?.id,
    name: role?.name ?? "",
    description: role?.description ?? "",
    color: role?.color ?? "#e2622d",
    permissions: role?.permissions ?? [],
  });
  const [message, setMessage] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const has = (key: string) => draft.permissions.includes(key);
  const setMany = (keys: string[], on: boolean) => {
    setDraft((d) => ({
      ...d,
      permissions: on ? [...new Set([...d.permissions, ...keys])] : d.permissions.filter((k) => !keys.includes(k)),
    }));
    setMessage(null);
  };

  function save() {
    startTransition(async () => {
      const res = await saveRole(draft);
      if (res.error) return setMessage({ error: res.error });
      setMessage({ ok: "Ruolo salvato." });
      router.refresh();
      if (res.id && !draft.id) onSaved(res.id);
    });
  }

  function remove() {
    if (!role || !window.confirm(`Eliminare il ruolo "${role.name}"? Chi lo ha tornerà Giocatore.`)) return;
    startTransition(async () => {
      const res = await deleteRole(role.id);
      if (res.error) return setMessage({ error: res.error });
      router.refresh();
      onDeleted();
    });
  }

  return (
    <section className="space-y-4">
      <div className="rounded-md border border-border bg-black/50 p-4">
        <h2 className="mb-1 font-serif text-xl text-accent">
          {role ? `Modifica: ${role.name}` : "Nuovo ruolo"}
          {isPlayerRole && <span className="ml-2 text-sm">🔒</span>}
        </h2>
        {isPlayerRole && (
          <p className="mb-3 text-sm text-muted">
            Ruolo di sistema: è il ruolo di tutti gli iscritti e i permessi che spunti qui valgono per
            ogni utente. Si può modificare ma non eliminare.
          </p>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
          <label className="block">
            <span className="mb-1 block text-xs text-muted uppercase">Nome</span>
            <input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              maxLength={40}
              placeholder="Es. Moderatore"
              className="input"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted uppercase">Descrizione</span>
            <input
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              maxLength={200}
              placeholder="A cosa serve questo ruolo"
              className="input"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted uppercase">Colore</span>
            <input
              type="color"
              value={draft.color}
              onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
              className="h-10 w-16 cursor-pointer rounded-md border border-border bg-background p-1"
            />
          </label>
        </div>
      </div>

      <PermissionGrid has={has} onChange={setMany} />

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className="btn">
          {pending ? "Salvataggio..." : role ? "Salva modifiche" : "Crea ruolo"}
        </button>
        {role && !isPlayerRole && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="btn-ghost border-red-900 text-red-400 hover:border-red-500 hover:text-red-300"
          >
            Elimina ruolo
          </button>
        )}
        {message?.error && <p className="text-sm text-red-400">{message.error}</p>}
        {message?.ok && <p className="text-sm text-green-400">{message.ok}</p>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------
// TAB 2 - Staffer: chi ha un ruolo diverso da Giocatore
// ---------------------------------------------------------------------
function StaffTab({ roles, users }: { roles: StaffRole[]; users: UserRow[] }) {
  const staff = users
    .map((u) => {
      const role = roles.find((r) => r.id === u.staff_role_id && !r.system_key);
      if (u.role === "admin") return { user: u, name: "Admin", color: ADMIN_COLOR, order: -1 };
      if (role) return { user: u, name: role.name, color: role.color, order: role.sort_order };
      return null;
    })
    .filter((s) => s !== null)
    .sort(
      (a, b) =>
        a.order - b.order ||
        a.name.localeCompare(b.name) ||
        (a.user.username ?? "").localeCompare(b.user.username ?? ""),
    );

  return (
    <section className="rounded-md border border-border bg-black/50 p-4">
      <h2 className="mb-3 font-serif text-xl tracking-wide text-accent uppercase">
        Staffer <span className="text-sm text-muted">({staff.length})</span>
      </h2>
      {staff.length === 0 ? (
        <p className="text-sm text-muted">Nessuno staffer. Assegna un ruolo dalla scheda &quot;Assegna&quot;.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {staff.map((s) => (
            <li key={s.user.id} className="flex items-center gap-3 py-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-blood/60 bg-background font-serif text-accent">
                {(s.user.username ?? "?")[0]}
              </span>
              <span className="flex-1 truncate font-serif">{s.user.username ?? "—"}</span>
              <RoleBadge name={s.name} color={s.color} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RoleBadge({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wider uppercase"
      style={{ borderColor: color, color, background: `${color}22` }}
    >
      {name}
    </span>
  );
}

// ---------------------------------------------------------------------
// TAB 3 - Assegna: utente + ruolo + pulsante
// ---------------------------------------------------------------------
function AssignTab({ roles, users, currentIsAdmin, currentUserId }: Props) {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [choice, setChoice] = useState<string | null>(null);
  const [message, setMessage] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const sortedUsers = [...users].sort((a, b) => (a.username ?? "").localeCompare(b.username ?? ""));
  const staffRoles = roles.filter((r) => !r.system_key);
  const user = users.find((u) => u.id === userId) ?? null;

  const currentChoice = (u: UserRow) => (u.role === "admin" ? ADMIN_CHOICE : (u.staff_role_id ?? PLAYER_CHOICE));
  const choiceLabel = (c: string) =>
    c === ADMIN_CHOICE ? "Admin" : c === PLAYER_CHOICE ? "Giocatore" : (roles.find((r) => r.id === c)?.name ?? "?");

  // Il ruolo proposto parte da quello attuale dell'utente scelto
  const selectedChoice = choice ?? (user ? currentChoice(user) : PLAYER_CHOICE);
  const locked = user?.role === "admin" && !currentIsAdmin;
  const unchanged = !user || selectedChoice === currentChoice(user);

  function assign() {
    if (!user) return;
    const name = user.username ?? "questo utente";
    if (selectedChoice === ADMIN_CHOICE && !window.confirm(`Nominare ${name} ADMIN? Avrà tutti i permessi.`)) return;
    if (
      user.id === currentUserId &&
      user.role === "admin" &&
      selectedChoice !== ADMIN_CHOICE &&
      !window.confirm("Stai togliendo a te stesso il ruolo di admin. Continuare?")
    )
      return;

    startTransition(async () => {
      const res = await assignRole(user.id, selectedChoice);
      if (res.error) return setMessage({ error: res.error });
      setMessage({ ok: `${name} ora è ${choiceLabel(selectedChoice)}.` });
      setChoice(null);
      router.refresh();
    });
  }

  return (
    <section className="max-w-2xl rounded-md border border-border bg-black/50 p-5">
      <h2 className="mb-4 font-serif text-xl tracking-wide text-accent uppercase">Assegna un ruolo</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Utente">
          <select
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value);
              setChoice(null);
              setMessage(null);
            }}
            className="input"
          >
            <option value="">— Scegli un utente —</option>
            {sortedUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username ?? "—"} ({choiceLabel(currentChoice(u))})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ruolo">
          <select
            value={selectedChoice}
            disabled={!user || locked}
            onChange={(e) => {
              setChoice(e.target.value);
              setMessage(null);
            }}
            className="input"
          >
            <option value={ADMIN_CHOICE} disabled={!currentIsAdmin}>
              Admin 🔒
            </option>
            <option value={PLAYER_CHOICE}>Giocatore</option>
            {staffRoles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {user && (
        <p className="mt-3 text-sm text-muted">
          Ruolo attuale di <strong className="text-foreground">{user.username}</strong>:{" "}
          {choiceLabel(currentChoice(user))}
          {locked && " — solo un admin può modificare un admin."}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" onClick={assign} disabled={!user || locked || unchanged || pending} className="btn">
          {pending ? "Assegnazione..." : "Assegna"}
        </button>
        {message?.error && <p className="text-sm text-red-400">{message.error}</p>}
        {message?.ok && <p className="text-sm text-green-400">{message.ok}</p>}
      </div>
    </section>
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
