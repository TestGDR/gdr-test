"use client";

import { Fragment, useState, useTransition } from "react";
import { downloadLogs, searchLogs, type LogFilters, type LogKind, type LogRow } from "./actions";

const TABS: { id: LogKind; label: string }[] = [
  { id: "chat", label: "Log chat" },
  { id: "missiva", label: "Missive (ON)" },
  { id: "off", label: "Messaggi OFF" },
];

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long", year: "numeric" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });

export default function LogViewer({
  canChat,
  canMessages,
  rooms,
}: {
  canChat: boolean;
  canMessages: boolean;
  rooms: { id: string; label: string }[];
}) {
  const tabs = TABS.filter((t) => (t.id === "chat" ? canChat : canMessages));
  const [kind, setKind] = useState<LogKind>(tabs[0].id);
  return (
    <div className="space-y-4">
      <div role="tablist" className="flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={kind === t.id}
            onClick={() => setKind(t.id)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-xs tracking-[0.12em] uppercase transition ${
              kind === t.id ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {/* ogni scheda ha la sua ricerca */}
      <Search key={kind} kind={kind} rooms={rooms} />
    </div>
  );
}

function Search({ kind, rooms }: { kind: LogKind; rooms: { id: string; label: string }[] }) {
  const chat = kind === "chat";
  const [f, setF] = useState<LogFilters>({ kind });
  const [result, setResult] = useState<{ rows: LogRow[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (patch: Partial<LogFilters>) => setF((x) => ({ ...x, ...patch }));

  const search = () =>
    start(async () => {
      const r = await searchLogs(f);
      setError(r.error ?? null);
      setResult(r.rows ? { rows: r.rows, total: r.total ?? 0 } : null);
    });

  const download = (format: "txt" | "csv") =>
    start(async () => {
      const r = await downloadLogs(f, format);
      if (r.error || r.content === undefined) return setError(r.error ?? "Scaricamento non riuscito.");
      const blob = new Blob([r.content], { type: format === "csv" ? "text/csv;charset=utf-8" : "text/plain;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `log-${kind}-${new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" })}.${format}`;
      a.click();
      URL.revokeObjectURL(a.href);
    });

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
        className="grid gap-3 border border-border bg-black/50 p-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {chat ? (
          <Field label="Chat">
            <select value={f.roomId ?? ""} onChange={(e) => set({ roomId: e.target.value || undefined })} className="input py-1.5">
              <option value="">Tutte le chat</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label={chat ? "Personaggio che scrive" : "Personaggio"}>
          <input value={f.character ?? ""} onChange={(e) => set({ character: e.target.value })} placeholder="Nome (anche in parte)" className="input py-1.5" />
        </Field>
        {!chat && (
          <Field label="In conversazione con">
            <input
              value={f.other ?? ""}
              onChange={(e) => set({ other: e.target.value })}
              placeholder="Facoltativo: l'altro personaggio"
              disabled={!f.character?.trim()}
              className="input py-1.5 disabled:opacity-50"
            />
          </Field>
        )}
        <Field label="Testo del messaggio">
          <input value={f.text ?? ""} onChange={(e) => set({ text: e.target.value })} placeholder="Parole da cercare" className="input py-1.5" />
        </Field>
        <Field label="Dal (data e ora)">
          <input type="datetime-local" value={f.from ?? ""} onChange={(e) => set({ from: e.target.value || undefined })} className="input py-1.5" />
        </Field>
        <Field label="Al (data e ora)">
          <input type="datetime-local" value={f.to ?? ""} onChange={(e) => set({ to: e.target.value || undefined })} className="input py-1.5" />
        </Field>
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-3">
          <button disabled={pending} className="btn px-4 py-1.5 text-sm">
            Cerca
          </button>
          <button type="button" disabled={pending} onClick={() => (setF({ kind }), setResult(null), setError(null))} className="btn-ghost px-3 py-1.5 text-sm">
            Azzera
          </button>
          <span className="ml-auto flex flex-wrap items-center gap-2 text-sm text-muted">
            <span title="Scarica i messaggi che corrispondono ai filtri impostati; senza filtri, tutto">Scarica:</span>
            <button type="button" disabled={pending} onClick={() => download("txt")} className="btn-ghost px-3 py-1.5 text-sm">
              Testo (.txt)
            </button>
            <button type="button" disabled={pending} onClick={() => download("csv")} className="btn-ghost px-3 py-1.5 text-sm">
              Excel (.csv)
            </button>
          </span>
        </div>
      </form>

      {pending && <p className="text-sm text-muted">Attendere...</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
      {result && <Results rows={result.rows} total={result.total} chat={chat} />}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-xs tracking-wide text-muted uppercase">
      <span>{label}</span>
      <span className="block text-sm tracking-normal normal-case">{children}</span>
    </label>
  );
}

// Risultati in ordine di tempo, divisi per giorno (e per chat quando cambia)
function Results({ rows, total, chat }: { rows: LogRow[]; total: number; chat: boolean }) {
  if (rows.length === 0) return <p className="py-6 text-center text-muted">Nessun messaggio trovato.</p>;
  return (
    <section className="space-y-2">
      <p className="text-sm text-muted">
        {total > rows.length
          ? `Trovati ${total} messaggi: qui sotto gli ultimi ${rows.length}. Restringi la ricerca o scarica i risultati per averli tutti.`
          : `Trovat${total === 1 ? "o 1 messaggio" : `i ${total} messaggi`}.`}
      </p>
      <div className="max-h-[70vh] overflow-y-auto border border-border bg-black/40">
        {rows.map((r, i) => {
          const prev = rows[i - 1];
          const newDay = !prev || day(prev.at) !== day(r.at);
          const newPlace = chat && (newDay || prev.place !== r.place);
          return (
            <Fragment key={r.id}>
              {newDay && <h3 className="sticky top-0 z-10 border-b border-border bg-panel px-3 py-1.5 font-serif text-sm text-accent capitalize">{day(r.at)}</h3>}
              {newPlace && <p className="px-3 pt-2 text-xs tracking-[0.12em] text-[#e2c99a] uppercase">{r.place}</p>}
              <article className="border-b border-border/40 px-3 py-2 text-sm">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-xs text-muted">{time(r.at)}</span>
                  <span className="font-serif text-accent">{chat ? r.author : r.place}</span>
                  {r.tag !== "azione" && <span className="text-xs text-muted">({r.tag})</span>}
                </p>
                <p className="mt-0.5 break-words whitespace-pre-wrap">{r.text}</p>
              </article>
            </Fragment>
          );
        })}
      </div>
    </section>
  );
}
