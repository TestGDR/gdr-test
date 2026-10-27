"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { useResync } from "@/lib/use-resync";

type GameEvent = {
  id: string;
  title: string;
  description: string;
  place: string;
  starts_at: string;
  ends_at: string | null;
  max_signups: number | null;
  author_name: string;
  created_by: string | null;
};
type Signup = { event_id: string; character_id: string; character: { name: string } | null };

const MONTHS = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const DAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
const longDay = (iso: string) =>
  new Date(iso).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
// per <input type="datetime-local">, nell'ora del dispositivo
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return `${dayKey(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// Calendario degli eventi: tutti li vedono e si iscrivono; master, moderatori e admin li creano
export default function CalendarPanel({
  userId,
  character,
  onSeen,
}: {
  userId: string;
  character: { id: string; name: string } | null;
  onSeen: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [events, setEvents] = useState<GameEvent[] | null>(null);
  const [signups, setSignups] = useState<Signup[]>([]);
  const [missing, setMissing] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [day, setDay] = useState<string | null>(() => dayKey(new Date()));
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<GameEvent | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now()); // "adesso" di quando si apre il calendario

  const load = useCallback(async () => {
    const [e, s] = await Promise.all([
      supabase.from("events").select("*").order("starts_at"),
      supabase.from("event_signups").select("event_id, character_id, character:characters(name)"),
    ]);
    setMissing(!!e.error);
    setEvents((e.data ?? []) as GameEvent[]);
    setSignups((s.data ?? []) as unknown as Signup[]);
  }, [supabase]);

  useEffect(() => {
    Promise.resolve().then(load);
    supabase.rpc("can_master_mode").then(({ data }) => setCanManage(data === true));
    // aperto il calendario: l'icona si spegne
    supabase
      .from("events_seen")
      .upsert({ user_id: userId, seen_at: new Date().toISOString() })
      .then(() => onSeen());
    const ch = supabase
      .channel("calendario-eventi")
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "event_signups" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, userId, load, onSeen]);

  if (events === null) return <p className="text-muted">Caricamento...</p>;
  if (missing) return <p className="text-amber-200">Per il calendario va eseguita la migrazione 0127 in Supabase.</p>;

  const byDay = new Map<string, GameEvent[]>();
  for (const e of events) {
    const k = dayKey(new Date(e.starts_at));
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }
  const signed = (id: string) => signups.filter((s) => s.event_id === id);
  const mine = (id: string) => !!character && signups.some((s) => s.event_id === id && s.character_id === character.id);

  // griglia del mese: da lunedi', con i giorni vuoti prima del primo
  const first = (month.getDay() + 6) % 7;
  const total = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array<null>(first).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  const today = dayKey(new Date(now));
  const shown = day ? (byDay.get(day) ?? []) : [];
  const upcoming = events.filter((e) => new Date(e.ends_at ?? e.starts_at).getTime() >= now).slice(0, 8);
  const open = events.find((e) => e.id === openId) ?? null;

  async function toggleSignup(e: GameEvent) {
    if (!character) return;
    setBusy(true);
    setError(null);
    const { error } = mine(e.id)
      ? await supabase.from("event_signups").delete().eq("event_id", e.id).eq("character_id", character.id)
      : await supabase.from("event_signups").insert({ event_id: e.id, character_id: character.id });
    setBusy(false);
    if (error) setError(error.message.length < 140 ? error.message : "Operazione non riuscita.");
    load();
  }

  async function remove(e: GameEvent) {
    if (!window.confirm(`Eliminare l'evento "${e.title}"? Spariranno anche le iscrizioni.`)) return;
    await supabase.from("events").delete().eq("id", e.id);
    setOpenId(null);
    load();
  }

  if (editing)
    return (
      <EventForm
        event={editing === "new" ? null : editing}
        defaultDay={day ?? today}
        authorName={character?.name ?? ""}
        onCancel={() => setEditing(null)}
        onSaved={(id) => {
          setEditing(null);
          setOpenId(id);
          load();
        }}
      />
    );

  if (open) {
    const list = signed(open.id);
    const full = open.max_signups !== null && list.length >= open.max_signups;
    const past = new Date(open.ends_at ?? open.starts_at).getTime() < now;
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setOpenId(null)} className="text-sm text-muted hover:text-accent">
          ← Calendario
        </button>
        <div className="space-y-1 border-l-2 border-blood bg-black/50 px-4 py-3">
          <h3 className="font-serif text-2xl tracking-wide text-accent">{open.title}</h3>
          <p className="text-sm capitalize">
            {longDay(open.starts_at)} · <span className="normal-case">ore {hhmm(open.starts_at)}</span>
            {open.ends_at && <span className="normal-case"> – {hhmm(open.ends_at)}</span>}
          </p>
          {open.place && <p className="text-sm text-muted">Luogo: {open.place}</p>}
          {open.author_name && <p className="text-xs text-muted">Organizzato da {open.author_name}</p>}
        </div>
        {open.description && <p className="leading-relaxed whitespace-pre-wrap">{open.description}</p>}
        <div className="space-y-2 border border-border bg-black/40 p-3">
          <p className="text-xs tracking-wider text-muted uppercase">
            Iscritti: {list.length}
            {open.max_signups !== null ? ` su ${open.max_signups}` : ""}
          </p>
          <p className="text-sm">{list.length ? list.map((s) => s.character?.name ?? "?").join(", ") : "Nessuno si è ancora iscritto."}</p>
          {error && <p className="text-sm text-red-400">{error}</p>}
          {past ? (
            <p className="text-sm text-muted">L&apos;evento è già passato.</p>
          ) : !character ? (
            <p className="text-sm text-muted">Per iscriverti serve un personaggio.</p>
          ) : (
            <button
              type="button"
              disabled={busy || (full && !mine(open.id))}
              onClick={() => toggleSignup(open)}
              className={mine(open.id) ? "btn-ghost px-4 py-1.5 text-sm" : "btn px-4 py-1.5 text-sm"}
            >
              {mine(open.id) ? "Annulla la mia iscrizione" : full ? "Posti esauriti" : `Iscrivi ${character.name}`}
            </button>
          )}
        </div>
        {canManage && (
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditing(open)} className="btn-ghost px-3 py-1 text-xs">
              Modifica evento
            </button>
            <button type="button" onClick={() => remove(open)} className="btn-ghost border-red-900 px-3 py-1 text-xs text-red-400 hover:border-red-500">
              Elimina
            </button>
          </div>
        )}
      </div>
    );
  }

  const row = (e: GameEvent, withDay: boolean) => (
    <li key={e.id}>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpenId(e.id);
        }}
        className="flex w-full items-center gap-3 border border-border border-l-2 border-l-blood bg-black/50 px-3 py-2 text-left transition hover:border-accent"
      >
        <span className="w-24 shrink-0 text-xs text-muted">
          {withDay && <span className="block text-foreground">{new Date(e.starts_at).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}</span>}
          ore {hhmm(e.starts_at)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-serif text-accent">{e.title}</span>
          {e.place && <span className="block truncate text-xs text-muted">{e.place}</span>}
        </span>
        <span className="shrink-0 text-xs text-muted">
          {signed(e.id).length} iscritt{signed(e.id).length === 1 ? "o" : "i"}
          {mine(e.id) && <span className="ml-2 text-green-400">✓ ci sei</span>}
        </span>
      </button>
    </li>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            aria-label="Mese precedente"
            className="px-2 text-lg text-muted hover:text-accent"
          >
            ‹
          </button>
          <h3 className="font-serif text-lg tracking-[0.15em] text-accent uppercase">
            {MONTHS[month.getMonth()]} {month.getFullYear()}
          </h3>
          <button
            type="button"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            aria-label="Mese successivo"
            className="px-2 text-lg text-muted hover:text-accent"
          >
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {DAYS.map((d) => (
            <span key={d} className="py-1 tracking-wider text-muted uppercase">
              {d}
            </span>
          ))}
          {cells.map((n, i) => {
            if (n === null) return <span key={`v${i}`} />;
            const k = dayKey(new Date(month.getFullYear(), month.getMonth(), n));
            const has = byDay.get(k)?.length ?? 0;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setDay(k)}
                aria-pressed={day === k}
                aria-label={`${n} ${MONTHS[month.getMonth()]}${has ? `: ${has} ${has === 1 ? "evento" : "eventi"}` : ""}`}
                className={`relative aspect-square border text-sm transition ${
                  day === k ? "border-accent bg-blood/30 text-accent" : k === today ? "border-accent/50" : "border-border/60 hover:border-accent/60"
                } ${has ? "font-semibold text-foreground" : "text-muted"}`}
              >
                {n}
                {has > 0 && <span className="absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-accent shadow-[0_0_6px_rgb(201_164_92/0.9)]" />}
              </button>
            );
          })}
        </div>
        {canManage && (
          <button type="button" onClick={() => setEditing("new")} className="btn mt-3 w-full text-sm">
            + Nuovo evento
          </button>
        )}
      </div>

      <div className="space-y-5">
        {day && (
          <section className="space-y-2">
            <h4 className="font-serif text-sm tracking-[0.15em] text-accent uppercase">
              {new Date(`${day}T12:00:00`).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
            </h4>
            {shown.length ? <ul className="space-y-2">{shown.map((e) => row(e, false))}</ul> : <p className="text-sm text-muted">Nessun evento in questo giorno.</p>}
          </section>
        )}
        <section className="space-y-2">
          <h4 className="font-serif text-sm tracking-[0.15em] text-accent uppercase">Prossimi eventi</h4>
          {upcoming.length ? <ul className="space-y-2">{upcoming.map((e) => row(e, true))}</ul> : <p className="text-sm text-muted">Nessun evento in programma.</p>}
        </section>
      </div>
    </div>
  );
}

// Crea o modifica un evento (solo master, moderatori e admin)
function EventForm({
  event,
  defaultDay,
  authorName,
  onCancel,
  onSaved,
}: {
  event: GameEvent | null;
  defaultDay: string;
  authorName: string;
  onCancel: () => void;
  onSaved: (id: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [title, setTitle] = useState(event?.title ?? "");
  const [place, setPlace] = useState(event?.place ?? "");
  const [start, setStart] = useState(event ? toLocalInput(event.starts_at) : `${defaultDay}T21:00`);
  const [end, setEnd] = useState(event?.ends_at ? toLocalInput(event.ends_at) : "");
  const [max, setMax] = useState(event?.max_signups ? String(event.max_signups) : "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !start) return setError("Servono almeno il titolo e la data.");
    const starts = new Date(start);
    const ends = end ? new Date(end) : null;
    if (ends && ends < starts) return setError("La fine non può essere prima dell'inizio.");
    const row = {
      title: title.trim(),
      place: place.trim(),
      description: description.trim(),
      starts_at: starts.toISOString(),
      ends_at: ends ? ends.toISOString() : null,
      max_signups: Math.trunc(Number(max)) > 0 ? Math.trunc(Number(max)) : null,
    };
    setBusy(true);
    setError(null);
    const res = event
      ? await supabase.from("events").update(row).eq("id", event.id).select("id").single()
      : await supabase.from("events").insert({ ...row, author_name: authorName }).select("id").single();
    setBusy(false);
    if (res.error)
      return setError(res.error.code === "42501" ? "Solo master, moderatori e admin possono creare eventi." : "Salvataggio non riuscito.");
    onSaved(res.data.id as string);
  }

  const label = "block space-y-1 text-xs tracking-wide text-muted uppercase";
  return (
    <form onSubmit={submit} className="mx-auto max-w-xl space-y-4">
      <h3 className="font-serif text-xl text-accent">{event ? "Modifica evento" : "Nuovo evento"}</h3>
      <label className={label}>
        Titolo
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required className="input normal-case" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Inizio
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required className="input" />
        </label>
        <label className={label}>
          Fine (facoltativa)
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className="input" />
        </label>
        <label className={label}>
          Luogo (facoltativo)
          <input value={place} onChange={(e) => setPlace(e.target.value)} maxLength={120} placeholder="Es. Fossa dei Draghi" className="input normal-case" />
        </label>
        <label className={label}>
          Posti (vuoto = senza limite)
          <input type="number" min={1} value={max} onChange={(e) => setMax(e.target.value)} className="input" />
        </label>
      </div>
      <label className={label}>
        Dettagli
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={7} maxLength={6000} className="input normal-case" />
      </label>
      {!event && (
        <p className="text-xs text-muted">Creando l&apos;evento, a tutti i giocatori arriva un messaggio di SISTEMA e l&apos;icona del calendario si accende.</p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button className="btn px-4" disabled={busy}>
          {busy ? "Salvataggio..." : event ? "Salva" : "Crea evento"}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost px-4">
          Annulla
        </button>
      </div>
    </form>
  );
}

// Eventi creati da altri dopo l'ultima apertura del calendario: l'icona si accende
export function useEventsUnseen(userId: string, viewing: boolean) {
  const supabase = useMemo(() => createClient(), []);
  const [unseen, setUnseen] = useState(false);
  const check = useCallback(async () => {
    const { data: seen } = await supabase.from("events_seen").select("seen_at").eq("user_id", userId).maybeSingle();
    let q = supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .or(`created_by.is.null,created_by.neq.${userId}`)
      .gt("starts_at", new Date(Date.now() - 86_400_000).toISOString());
    if (seen?.seen_at) q = q.gt("created_at", seen.seen_at as string);
    const { count, error } = await q;
    return !error && (count ?? 0) > 0;
  }, [supabase, userId]);
  useEffect(() => {
    const ch = supabase
      .channel(`eventi-nuovi:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "events" }, () => {
        check().then(setUnseen);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, userId, check]);
  useEffect(() => {
    if (!viewing) check().then(setUnseen);
  }, [viewing, check]);
  useResync(() => {
    if (!viewing) check().then(setUnseen);
  });
  return { unseen: unseen && !viewing, clear: useCallback(() => setUnseen(false), []) };
}
