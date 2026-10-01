"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { PERMISSION_SECTIONS } from "@/lib/permissions";
import type { StaffRole } from "@/lib/staff";
import { assignRole, deleteRole, saveRole, type RoleInput } from "./actions";

export type UserRow = { id: string; username: string | null; role: string; staff_role_id: string | null };

const NEW = "nuovo";

export default function RolesManager({ roles, users }: { roles: StaffRole[]; users: UserRow[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(roles[0]?.id ?? NEW);
  const selected = roles.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        {/* Elenco dei ruoli */}
        <aside className="rounded-md border border-border bg-black/50 p-3">
          <h2 className="mb-2 text-xs font-semibold tracking-[0.15em] text-muted uppercase">Ruoli staff</h2>
          <ul className="space-y-1">
            {roles.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className={`flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm transition hover:bg-blood/20 ${
                    r.id === selectedId ? "bg-blood/30" : ""
                  }`}
                >
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: r.color }} />
                  <span className="flex-1 truncate">{r.name}</span>
                  <span className="text-xs text-muted">{r.permissions.length}</span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setSelectedId(NEW)}
            className={`btn-ghost mt-3 w-full text-sm ${selectedId === NEW ? "border-accent text-accent" : ""}`}
          >
            + Nuovo ruolo
          </button>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            L&apos;<strong>Admin</strong> ha sempre tutti i permessi e non compare qui.
          </p>
        </aside>

        {/* Il key fa ripartire il modulo da zero quando cambi ruolo (e quando un ruolo
            appena creato arriva dal server) */}
        <RoleEditor
          key={`${selectedId ?? NEW}-${selected ? "pronto" : "attesa"}`}
          role={selected}
          onSaved={(id) => setSelectedId(id)}
          onDeleted={() => setSelectedId(roles.find((r) => r.id !== selectedId)?.id ?? NEW)}
        />
      </div>

      <UserAssignments roles={roles} users={users} />
    </div>
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
    if (!role || !window.confirm(`Eliminare il ruolo "${role.name}"? Chi lo ha tornerà semplice giocatore.`)) return;
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
        <h2 className="mb-3 font-serif text-xl text-accent">{role ? `Modifica: ${role.name}` : "Nuovo ruolo"}</h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
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

      {PERMISSION_SECTIONS.map((section) => {
        const keys = section.items.map((i) => i.key);
        const count = keys.filter(has).length;
        return (
          <div key={section.id} className="rounded-md border border-border bg-black/50 p-4">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h3 className="font-serif text-lg tracking-wide text-accent uppercase">
                  {section.title}{" "}
                  <span className="text-xs text-muted normal-case">
                    {count}/{keys.length}
                  </span>
                </h3>
                <p className="text-xs text-muted">{section.description}</p>
              </div>
              <div className="flex gap-3 text-xs tracking-widest uppercase">
                <button type="button" onClick={() => setMany(keys, true)} className="text-accent hover:underline">
                  Tutti
                </button>
                <button type="button" onClick={() => setMany(keys, false)} className="text-muted hover:underline">
                  Nessuno
                </button>
              </div>
            </div>
            <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {section.items.map((item) => (
                <li key={item.key}>
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      checked={has(item.key)}
                      onChange={(e) => setMany([item.key], e.target.checked)}
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

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className="btn">
          {pending ? "Salvataggio..." : role ? "Salva modifiche" : "Crea ruolo"}
        </button>
        {role && (
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

function UserAssignments({ roles, users }: { roles: StaffRole[]; users: UserRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [onlyStaff, setOnlyStaff] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter(
      (u) =>
        (!q || (u.username ?? "").toLowerCase().includes(q)) &&
        (!onlyStaff || u.staff_role_id || u.role === "admin"),
    );
  }, [users, query, onlyStaff]);

  async function change(user: UserRow, roleId: string) {
    setPendingId(user.id);
    setError(null);
    const res = await assignRole(user.id, roleId || null);
    setPendingId(null);
    if (res.error) return setError(res.error);
    router.refresh();
  }

  return (
    <section className="rounded-md border border-border bg-black/50 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-xl tracking-wide text-accent uppercase">Assegna ruoli</h2>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={onlyStaff}
              onChange={(e) => setOnlyStaff(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            Solo staff
          </label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca utente..."
            className="input w-56 py-1.5 text-sm"
          />
        </div>
      </div>
      {error && <p className="mb-2 text-sm text-red-400">{error}</p>}

      <ul className="divide-y divide-border/60">
        {visible.map((u) => {
          const role = roles.find((r) => r.id === u.staff_role_id);
          return (
            <li key={u.id} className="flex flex-wrap items-center gap-3 py-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: role?.color ?? "transparent" }} />
              <span className="min-w-32 flex-1 font-serif">{u.username ?? "—"}</span>
              {u.role === "admin" && (
                <span className="rounded border border-accent/60 px-1.5 text-[10px] tracking-wider text-accent uppercase">
                  Admin
                </span>
              )}
              <select
                value={u.staff_role_id ?? ""}
                disabled={pendingId === u.id}
                onChange={(e) => change(u, e.target.value)}
                className="input w-56 py-1.5 text-sm"
              >
                <option value="">— Nessun ruolo (giocatore) —</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
        {visible.length === 0 && <li className="py-3 text-sm text-muted">Nessun utente trovato.</li>}
      </ul>
    </section>
  );
}
