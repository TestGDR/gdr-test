"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { downloadGame, gameDay, gameTime, gameTitle, type SavedGame, type SavedMessage } from "@/lib/saved-games";
import { createClient } from "@/lib/supabase/client";

const MONTHS = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const LIST_COLS = "id, room_name, place_name, started_at, ended_at, participants, message_count, note, created_at";
type Row = Omit<SavedGame, "messages" | "avatars">;

// Utility -> Archivio giocate: le giocate salvate dal giocatore (solo le sue)
export default function GameArchive() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [place, setPlace] = useState("");
  const [person, setPerson] = useState("");
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<string[] | null>(null); // giocate che contengono il testo cercato
  const [open, setOpen] = useState<SavedGame | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    () =>
      supabase
        .from("saved_games")
        .select(LIST_COLS)
        .order("started_at", { ascending: false })
        .then(({ data, error }) => {
          setMissing(!!error);
          setRows((data ?? []) as Row[]);
        }),
    [supabase],
  );
  useEffect(() => {
    load();
  }, [load]);

  const full = useCallback(
    async (id: string) => {
      const { data } = await supabase.from("saved_games").select("*").eq("id", id).maybeSingle();
      return (data as SavedGame | null) ?? null;
    },
    [supabase],
  );

  async function search() {
    const q = query.trim();
    if (!q) return setFound(null);
    setBusy("cerca");
    // il testo si cerca dentro le giocate: si leggono per intero solo adesso
    const { data } = await supabase.from("saved_games").select("id, room_name, note, messages");
    const needle = q.toLowerCase();
    setFound(
      ((data ?? []) as Pick<SavedGame, "id" | "room_name" | "note" | "messages">[])
        .filter(
          (g) =>
            g.room_name.toLowerCase().includes(needle) ||
            g.note.toLowerCase().includes(needle) ||
            g.messages.some((m) => m.content.toLowerCase().includes(needle)),
        )
        .map((g) => g.id),
    );
    setBusy(null);
  }

  async function remove(g: Row) {
    if (!window.confirm(`Cancellare dall'archivio la giocata "${gameTitle(g)}"? Non si può recuperare.`)) return;
    setBusy(g.id);
    await supabase.from("saved_games").delete().eq("id", g.id);
    setBusy(null);
    setOpen(null);
    load();
  }

  async function download(g: Row) {
    setBusy(g.id);
    const game = await full(g.id);
    setBusy(null);
    if (game) downloadGame(game);
  }

  if (rows === null) return <p className="text-muted">Caricamento...</p>;
  if (missing) return <p className="text-amber-200">Per l&apos;archivio va eseguita la migrazione 0124 in Supabase.</p>;

  if (open)
    return (
      <GameView
        game={open}
        onBack={() => setOpen(null)}
        onDownload={() => downloadGame(open)}
        onDelete={() => remove(open)}
        onNote={async (note) => {
          await supabase.from("saved_games").update({ note }).eq("id", open.id);
          setOpen({ ...open, note });
          load();
        }}
      />
    );

  const places = [...new Set(rows.map((r) => r.room_name))].sort();
  const people = [...new Set(rows.flatMap((r) => r.participants))].sort();
  const list = rows.filter(
    (r) => (!place || r.room_name === place) && (!person || r.participants.includes(person)) && (!found || found.includes(r.id)),
  );
  // per anno e per mese, dalla piu' recente
  const groups: { year: number; months: { month: number; games: Row[] }[] }[] = [];
  for (const g of list) {
    const d = new Date(g.started_at);
    let y = groups.find((x) => x.year === d.getFullYear());
    if (!y) groups.push((y = { year: d.getFullYear(), months: [] }));
    let m = y.months.find((x) => x.month === d.getMonth());
    if (!m) y.months.push((m = { month: d.getMonth(), games: [] }));
    m.games.push(g);
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
        className="flex flex-wrap gap-2"
      >
        <select value={place} onChange={(e) => setPlace(e.target.value)} aria-label="Luogo" className="input w-48!">
          <option value="">Tutti i luoghi</option>
          {places.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Personaggio" className="input w-48!">
          <option value="">Tutte le persone</option>
          {people.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!e.target.value.trim()) setFound(null);
          }}
          placeholder="Parola o frase nella giocata..."
          className="input min-w-48 flex-1"
        />
        <button className="btn px-4" disabled={busy === "cerca"}>
          {busy === "cerca" ? "..." : "Cerca"}
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-muted">
          Non hai ancora salvato nessuna giocata. Quando esci da una chat con &quot;Esci dalla chat&quot; puoi scegliere di salvarla
          qui.
        </p>
      ) : list.length === 0 ? (
        <p className="py-8 text-center text-muted">Nessuna giocata trovata con questi filtri.</p>
      ) : (
        groups.map((y) => (
          <section key={y.year} className="space-y-3">
            <h3 className="flex items-center gap-4 font-serif text-2xl tracking-[0.2em] text-accent before:h-px before:flex-1 before:bg-blood/60 after:h-px after:flex-1 after:bg-border">
              {y.year}
            </h3>
            {y.months.map((m) => (
              <div key={m.month} className="grid gap-2 sm:grid-cols-[7rem_minmax(0,1fr)]">
                <div className="sm:pt-2 sm:text-right">
                  <p className="font-serif text-sm tracking-[0.15em] text-blood uppercase">{MONTHS[m.month]}</p>
                  <p className="text-[0.6875rem] tracking-wider text-muted uppercase">
                    {m.games.length} {m.games.length === 1 ? "giocata" : "giocate"}
                  </p>
                </div>
                <ul className="space-y-2">
                  {m.games.map((g) => (
                    <li key={g.id} className="flex items-center gap-2 border border-border border-l-2 border-l-blood bg-black/50 px-3 py-2">
                      <button
                        type="button"
                        onClick={async () => {
                          setBusy(g.id);
                          setOpen(await full(g.id));
                          setBusy(null);
                        }}
                        className="min-w-0 flex-1 text-left hover:text-accent"
                      >
                        <span className="block truncate text-sm font-semibold tracking-wide uppercase">{gameTitle(g)}</span>
                        <span className="block truncate text-xs text-muted">
                          {g.place_name ? `${g.place_name} · ` : ""}
                          {gameTime(g.started_at)}-{gameTime(g.ended_at)} · {g.participants.join(", ")}
                          {g.note ? ` · ${g.note}` : ""}
                        </span>
                      </button>
                      <span className="shrink-0 border border-border px-2 py-0.5 text-xs text-muted" title="Azioni nella giocata">
                        {g.message_count}
                      </span>
                      <button
                        type="button"
                        onClick={() => download(g)}
                        disabled={busy === g.id}
                        title="Scarica la giocata"
                        aria-label={`Scarica ${gameTitle(g)}`}
                        className="shrink-0 border border-border px-2 py-0.5 text-xs text-muted hover:border-accent hover:text-accent"
                      >
                        Scarica
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(g)}
                        disabled={busy === g.id}
                        title="Cancella dall'archivio"
                        aria-label={`Cancella ${gameTitle(g)}`}
                        className="shrink-0 px-1 text-sm text-muted hover:text-red-400"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}

// Una giocata aperta: intestazione, nota personale e i messaggi come in chat
function GameView({
  game,
  onBack,
  onDownload,
  onDelete,
  onNote,
}: {
  game: SavedGame;
  onBack: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onNote: (note: string) => Promise<void>;
}) {
  const [note, setNote] = useState(game.note);
  const [editing, setEditing] = useState(false);
  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="text-sm text-muted hover:text-accent">
        ← Archivio giocate
      </button>
      <div className="border border-border border-l-2 border-l-blood bg-black/50 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs tracking-wider text-muted uppercase">
              {gameDay(game.started_at)} · {game.place_name || game.room_name} · {gameTime(game.started_at)}-{gameTime(game.ended_at)} ·{" "}
              {game.participants.join(", ")}
            </p>
            <h3 className="truncate font-serif text-xl tracking-wide text-accent">{gameTitle(game)}</h3>
          </div>
          <span className="shrink-0 border border-border px-2 py-0.5 text-xs text-muted">{game.message_count} azioni</span>
          <button type="button" onClick={onDownload} className="btn-ghost shrink-0 px-3 py-1 text-xs">
            Scarica
          </button>
          <button type="button" onClick={onDelete} className="btn-ghost shrink-0 border-red-900 px-3 py-1 text-xs text-red-400 hover:border-red-500">
            Cancella
          </button>
        </div>
        <div className="mt-2 border-t border-border/60 pt-2 text-sm">
          {editing ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await onNote(note.trim().slice(0, 1000));
                setEditing(false);
              }}
              className="flex flex-wrap gap-2"
            >
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} autoFocus placeholder="Nota personale" className="input min-w-0 flex-1 py-1" />
              <button className="btn px-3 py-1 text-xs">Salva nota</button>
            </form>
          ) : (
            <button type="button" onClick={() => setEditing(true)} className="text-left text-muted italic hover:text-foreground">
              <span className="mr-2 text-xs font-semibold tracking-wider text-blood not-italic uppercase">Nota</span>
              {game.note || "Clicca per aggiungere una nota personale."}
            </button>
          )}
        </div>
      </div>
      <div className="space-y-2">
        {game.messages.map((m, i) => (
          <SavedRow key={i} m={m} avatar={game.avatars[m.name]} />
        ))}
      </div>
    </div>
  );
}

function SavedRow({ m, avatar }: { m: SavedMessage; avatar?: string }) {
  const time = gameTime(m.t);
  if (m.kind === "sistema")
    return (
      <p className="rounded-md bg-gradient-to-r from-black/80 via-[#5a1414]/55 to-black/80 px-3 py-1.5 text-sm text-[#d9b8b8]">
        <span className="mr-2 text-xs text-muted">{time}</span>
        {m.name} {m.content}
      </p>
    );
  if (m.kind === "dado")
    return (
      <p className="border border-border/60 bg-black/50 px-3 py-1.5 text-sm text-muted">
        <span className="mr-2 text-xs">{time}</span>
        <strong className="text-foreground">{m.name}</strong> {m.content}
      </p>
    );
  const master = m.kind === "master";
  return (
    <div
      className={`flex gap-3 px-3 py-2.5 shadow-lg shadow-black/70 ${
        master ? "border-l-2 border-accent bg-gradient-to-r from-[#45100b] to-[#2d0a07]" : "border-l-2 border-blood bg-black/80"
      }`}
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden border border-accent/40 bg-black/60 font-serif text-lg text-accent">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" className="h-full w-full object-cover" />
        ) : (
          m.name[0]
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-xs">
          <span className="mr-2 text-accent">{time}</span>
          <strong className="tracking-[0.15em] uppercase">{master ? "Master" : m.name}</strong>
          {m.to && <span className="text-muted"> → {m.to}</span>}
        </p>
        <p className="chat-text leading-relaxed whitespace-pre-wrap">{m.content}</p>
      </div>
    </div>
  );
}
