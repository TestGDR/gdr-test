"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  countChatMessages,
  countPrivateMessages,
  deleteChatMessages,
  deleteInactive,
  deletePrivateMessages,
  listInactive,
  type InactiveUser,
} from "./actions";

const PERIODS = [
  { id: "7g", label: "più vecchi di 7 giorni" },
  { id: "1m", label: "più vecchi di 1 mese" },
  { id: "3m", label: "più vecchi di 3 mesi" },
  { id: "6m", label: "più vecchi di 6 mesi" },
  { id: "1a", label: "più vecchi di 1 anno" },
];
const INACTIVE_PERIODS = [
  { id: "1m", label: "da più di 1 mese" },
  { id: "3m", label: "da più di 3 mesi" },
  { id: "6m", label: "da più di 6 mesi" },
  { id: "1a", label: "da più di 1 anno" },
];

export default function Maintenance() {
  return (
    <div className="space-y-6">
      <ChatSection />
      <PrivateSection />
      <InactiveSection />
    </div>
  );
}

function Box({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border border-border bg-black/50 p-5">
      <h2 className="font-serif text-xl text-accent">{title}</h2>
      <p className="text-sm text-muted">{text}</p>
      {children}
    </section>
  );
}

function PeriodSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { id: string; label: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Periodo" className="input w-56! py-1.5">
      {options.map((p) => (
        <option key={p.id} value={p.id}>
          {p.label}
        </option>
      ))}
    </select>
  );
}

const Feedback = ({ msg }: { msg: { ok: boolean; text: string } | null }) =>
  msg && <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>;

// ---------------------------------------------------------------------
function ChatSection() {
  const [period, setPeriod] = useState("6m");
  const [count, setCount] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const label = PERIODS.find((p) => p.id === period)?.label;

  return (
    <Box title="Messaggi delle chat" text="Elimina i messaggi scritti nelle chat di gioco prima del periodo scelto, in tutte le chat.">
      <div className="flex flex-wrap items-center gap-2">
        <PeriodSelect value={period} onChange={(v) => (setPeriod(v), setCount(null), setMsg(null))} options={PERIODS} />
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await countChatMessages(period);
              setMsg(r.error ? { ok: false, text: r.error } : null);
              setCount(r.count ?? null);
            })
          }
          className="btn-ghost px-3 py-1.5 text-sm"
        >
          Conta
        </button>
        {count !== null && (
          <button
            type="button"
            disabled={pending || count === 0}
            onClick={() =>
              window.confirm(`Eliminare definitivamente ${count} messaggi delle chat ${label}?`) &&
              start(async () => {
                const r = await deleteChatMessages(period);
                setCount(null);
                setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: `Eliminati ${r.count} messaggi delle chat.` });
              })
            }
            className="btn-ghost border-red-900 px-3 py-1.5 text-sm text-red-400 hover:border-red-500"
          >
            Elimina {count} messaggi
          </button>
        )}
      </div>
      {count !== null && <p className="text-sm">Messaggi delle chat {label}: <strong>{count}</strong></p>}
      <Feedback msg={msg} />
    </Box>
  );
}

// ---------------------------------------------------------------------
function PrivateSection() {
  const [period, setPeriod] = useState("6m");
  const [kind, setKind] = useState("entrambi");
  const [count, setCount] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const label = PERIODS.find((p) => p.id === period)?.label;
  const kindLabel = kind === "missiva" ? "missive" : kind === "off" ? "messaggi OFF" : "missive e messaggi OFF";

  return (
    <Box title="Missive e messaggi OFF" text="Elimina i messaggi privati tra personaggi prima del periodo scelto: le missive (in gioco), gli OFF (fuori gioco) o entrambi.">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={kind}
          onChange={(e) => (setKind(e.target.value), setCount(null), setMsg(null))}
          aria-label="Tipo di messaggi"
          className="input w-56! py-1.5"
        >
          <option value="entrambi">Missive e messaggi OFF</option>
          <option value="missiva">Solo missive</option>
          <option value="off">Solo messaggi OFF</option>
        </select>
        <PeriodSelect value={period} onChange={(v) => (setPeriod(v), setCount(null), setMsg(null))} options={PERIODS} />
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await countPrivateMessages(period, kind);
              setMsg(r.error ? { ok: false, text: r.error } : null);
              setCount(r.count ?? null);
            })
          }
          className="btn-ghost px-3 py-1.5 text-sm"
        >
          Conta
        </button>
        {count !== null && (
          <button
            type="button"
            disabled={pending || count === 0}
            onClick={() =>
              window.confirm(`Eliminare definitivamente ${count} ${kindLabel} ${label}?`) &&
              start(async () => {
                const r = await deletePrivateMessages(period, kind);
                setCount(null);
                setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: `Eliminati ${r.count} messaggi privati.` });
              })
            }
            className="btn-ghost border-red-900 px-3 py-1.5 text-sm text-red-400 hover:border-red-500"
          >
            Elimina {count}
          </button>
        )}
      </div>
      {count !== null && (
        <p className="text-sm">
          {kindLabel[0].toUpperCase() + kindLabel.slice(1)} {label}: <strong>{count}</strong>
        </p>
      )}
      <Feedback msg={msg} />
    </Box>
  );
}

// ---------------------------------------------------------------------
function InactiveSection() {
  const [period, setPeriod] = useState("1m");
  const [users, setUsers] = useState<InactiveUser[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const label = INACTIVE_PERIODS.find((p) => p.id === period)?.label;
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }) : "mai");

  return (
    <Box
      title="Personaggi inattivi"
      text="Elimina gli account che non entrano e non fanno nulla nel sito dal periodo scelto, con il loro personaggio. Staff e admin non vengono mai eliminati. Se un personaggio era cavaliere di un drago, il drago resta senza cavaliere."
    >
      <div className="flex flex-wrap items-center gap-2">
        <PeriodSelect value={period} onChange={(v) => (setPeriod(v), setUsers(null), setMsg(null))} options={INACTIVE_PERIODS} />
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await listInactive(period);
              setMsg(r.error ? { ok: false, text: r.error } : null);
              setUsers(r.users ?? null);
            })
          }
          className="btn-ghost px-3 py-1.5 text-sm"
        >
          Mostra
        </button>
        {users && users.length > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              window.confirm(`Eliminare definitivamente ${users.length} account inattivi ${label}, con i loro personaggi?`) &&
              start(async () => {
                const r = await deleteInactive(
                  period,
                  users.map((u) => u.id),
                );
                setUsers(null);
                setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: `Eliminati ${r.count} account inattivi.` });
              })
            }
            className="btn-ghost border-red-900 px-3 py-1.5 text-sm text-red-400 hover:border-red-500"
          >
            Elimina {users.length} account
          </button>
        )}
      </div>
      {users && users.length === 0 && <p className="text-sm text-muted">Nessun personaggio inattivo {label}.</p>}
      {users && users.length > 0 && (
        <ul className="max-h-72 divide-y divide-border/60 overflow-y-auto border border-border/60 text-sm">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 px-3 py-1.5">
              <span className="flex-1 font-serif">{u.name}</span>
              {u.rider && <span className="text-xs text-[#e8cf9c]">cavaliere di un drago (il drago resterà senza cavaliere)</span>}
              <span className="text-xs text-muted">ultima attività: {when(u.lastActivity)}</span>
            </li>
          ))}
        </ul>
      )}
      <Feedback msg={msg} />
    </Box>
  );
}
