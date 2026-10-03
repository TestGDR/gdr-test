"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { banUser, deleteUser, unbanUser, updateUser, type UserResult } from "./actions";

export type UserRow = {
  id: string;
  createdAt: string;
  lastSignIn: string | null;
  username: string;
  role: string;
  staffRole: { name: string; color: string } | null;
  bannedUntil: string | null;
  banReason: string;
  character: { id: string; name: string; status: string; house: string | null } | null;
};

const BAN_OPTIONS = [
  { label: "1 giorno", hours: 24 },
  { label: "7 giorni", hours: 24 * 7 },
  { label: "30 giorni", hours: 24 * 30 },
  { label: "Per sempre", hours: null },
] as const;

const banned = (r: UserRow) =>
  !!r.bannedUntil && (r.bannedUntil === "infinity" || Number.isNaN(Date.parse(r.bannedUntil)) || Date.parse(r.bannedUntil) > Date.now());

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

// Elenco degli utenti con modifica, ban, sblocco ed eliminazione
export default function UsersManager({ rows, myId, iAmAdmin }: { rows: UserRow[]; myId: string; iAmAdmin: boolean }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"tutti" | "bannati">("tutti");
  const [openId, setOpenId] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const list = rows.filter(
    (r) =>
      (filter === "tutti" || banned(r)) &&
      (!q || [r.username, r.character?.name ?? "", r.character?.house ?? ""].some((x) => x.toLowerCase().includes(q))),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca personaggio, utente o casata..." className="input w-72!" />
        <select value={filter} onChange={(e) => setFilter(e.target.value as "tutti" | "bannati")} aria-label="Filtro" className="input w-auto!">
          <option value="tutti">Tutti ({rows.length})</option>
          <option value="bannati">Solo bannati ({rows.filter(banned).length})</option>
        </select>
      </div>

      <ul className="divide-y divide-border/60 border border-border/60 bg-black/40">
        {list.map((r) => {
          const locked = r.id === myId || (r.role === "admin" && !iAmAdmin);
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setOpenId(openId === r.id ? null : r.id)}
                aria-expanded={openId === r.id}
                className={`flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-left text-sm hover:bg-blood/10 ${openId === r.id ? "bg-blood/15" : ""}`}
              >
                <span className="min-w-44 flex-1">
                  <span className="font-serif text-accent">
                    {r.character?.name ?? "—"}
                    {r.character?.house && <span className="text-foreground/70"> {r.character.house}</span>}
                  </span>
                  <span className="block text-xs text-muted">
                    {r.username}
                  </span>
                </span>
                <span className="w-28 text-xs" style={{ color: r.staffRole?.color ?? undefined }}>
                  {r.role === "admin" ? "Admin" : (r.staffRole?.name ?? <span className="text-muted">Giocatore</span>)}
                </span>
                <span className="w-36 text-xs text-muted" title="Ultimo accesso">
                  {when(r.lastSignIn)}
                </span>
                <span className="w-28 text-xs">
                  {banned(r) ? (
                    <span className="text-red-400">Bannato</span>
                  ) : r.character?.status !== "attivo" ? (
                    <span className="text-orange-300">PG non attivo</span>
                  ) : (
                    <span className="text-green-400">Attivo</span>
                  )}
                </span>
              </button>
              {openId === r.id && <UserPanel row={r} locked={locked} isMe={r.id === myId} onDeleted={() => setOpenId(null)} />}
            </li>
          );
        })}
        {list.length === 0 && <li className="px-3 py-3 text-sm text-muted">Nessun utente trovato.</li>}
      </ul>
    </div>
  );
}

function UserPanel({ row, locked, isMe, onDeleted }: { row: UserRow; locked: boolean; isMe: boolean; onDeleted: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [username, setUsername] = useState(row.username);
  const [pgName, setPgName] = useState(row.character?.name ?? "");
  const [banHours, setBanHours] = useState<number | null>(24);
  const [reason, setReason] = useState("");

  function run(action: () => Promise<UserResult>, ok: string, after?: () => void) {
    setMsg(null);
    start(async () => {
      const res = await action();
      if (res.error) return setMsg({ ok: false, text: res.error });
      setMsg({ ok: true, text: ok });
      router.refresh();
      after?.();
    });
  }

  if (locked) {
    return (
      <p className="border-t border-border/60 bg-black/30 px-4 py-3 text-sm text-muted">
        {isMe ? "Questo è il tuo account: non puoi modificarlo, bannarlo o eliminarlo da qui." : "Solo un admin può intervenire su un altro admin."}
      </p>
    );
  }

  return (
    <div className="space-y-4 border-t border-border/60 bg-black/30 px-4 py-4 text-sm">
      <p className="text-xs text-muted">
        Registrato il {when(row.createdAt)} · ultimo accesso {when(row.lastSignIn)}
      </p>

      <section className="space-y-2">
        <h4 className="font-serif text-accent">Modifica</h4>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-muted uppercase">Nome utente</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={30} className="input py-1" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted uppercase">Nome del personaggio</span>
            <input value={pgName} onChange={(e) => setPgName(e.target.value)} maxLength={40} disabled={!row.character} className="input py-1" />
          </label>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(() => updateUser(row.id, { username, characterId: row.character?.id ?? null, characterName: pgName }), "Utente aggiornato.")
          }
          className="btn px-4 py-1.5 text-sm"
        >
          Salva modifiche
        </button>
      </section>

      <section className="space-y-2">
        <h4 className="font-serif text-accent">Ban</h4>
        {banned(row) ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-red-300">
              Bannato {row.bannedUntil === "infinity" ? "per sempre" : `fino al ${when(row.bannedUntil)}`}
              {row.banReason && <span className="text-muted"> · {row.banReason}</span>}
            </span>
            <button type="button" disabled={pending} onClick={() => run(() => unbanUser(row.id), "Ban tolto: l'utente può di nuovo accedere.")} className="btn-ghost px-3 py-1 text-xs">
              Togli il ban
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={banHours === null ? "sempre" : String(banHours)}
              onChange={(e) => setBanHours(e.target.value === "sempre" ? null : Number(e.target.value))}
              aria-label="Durata del ban"
              className="input w-36! py-1"
            >
              {BAN_OPTIONS.map((o) => (
                <option key={o.label} value={o.hours === null ? "sempre" : o.hours}>
                  {o.label}
                </option>
              ))}
            </select>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Motivo (lo vedrà l'utente)" className="input min-w-56 flex-1 py-1" />
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                window.confirm(`Bannare ${row.character?.name ?? row.username}? Non potrà più accedere ${banHours === null ? "in modo permanente" : "fino alla scadenza"}.`) &&
                run(() => banUser(row.id, banHours, reason), "Utente bannato: non può più accedere e, se è collegato, viene fatto uscire alla prossima pagina che apre.")
              }
              className="btn-ghost border-red-900 px-3 py-1 text-xs text-red-400 hover:border-red-500"
            >
              Banna
            </button>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h4 className="font-serif text-red-400">Eliminazione</h4>
        <p className="text-xs text-muted">Cancella per sempre l&apos;account con il personaggio, i messaggi e tutto ciò che gli appartiene. Non si può annullare.</p>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const name = row.character?.name ?? row.username;
            const typed = window.prompt(`Per eliminare definitivamente l'account, scrivi il nome "${name}"`);
            if (typed === null) return;
            if (typed.trim().toLowerCase() !== name.toLowerCase()) return setMsg({ ok: false, text: "Il nome non corrisponde: account non eliminato." });
            run(() => deleteUser(row.id), "Account eliminato.", onDeleted);
          }}
          className="btn-ghost border-red-900 px-3 py-1 text-xs text-red-400 hover:border-red-500"
        >
          Elimina account
        </button>
      </section>

      {msg && <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>}
    </div>
  );
}
