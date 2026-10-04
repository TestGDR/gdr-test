"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MainCharacter } from "@/lib/main-character";
import { Avatar, type Contact } from "./MessagesModal";

type PlayRequest = {
  id: string;
  author_id: string;
  text: string;
  starts_at: string;
  ends_at: string;
  created_at: string;
  character: { id: string; name: string; avatar_url: string | null } | null;
};

// Giorno e orari nel fuso italiano
const ROME = "Europe/Rome";
const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("it-IT", { timeZone: ROME, weekday: "long", day: "numeric", month: "long" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("it-IT", { timeZone: ROME, hour: "2-digit", minute: "2-digit" });
const todayRome = () => new Date().toLocaleDateString("sv-SE", { timeZone: ROME });

// Data (AAAA-MM-GG) e ora (HH:MM) del fuso italiano -> istante esatto
function romeToDate(day: string, hm: string) {
  const guess = new Date(`${day}T${hm}:00Z`);
  // differenza tra l'ora italiana e quella di Greenwich in quel giorno (ora legale compresa)
  const shown = new Date(guess.toLocaleString("en-US", { timeZone: ROME }));
  const utc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (shown.getTime() - utc.getTime()));
}

// Richieste di gioco nuove (non ancora viste), aggiornate in tempo reale:
// finche' ce n'e' qualcuna l'icona lampeggia
export function usePlayRequestsUnseen(userId: string, viewing: boolean) {
  const supabase = useMemo(() => createClient(), []);
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(async () => {
    const { data: seen } = await supabase.from("play_requests_seen").select("seen_at").eq("user_id", userId).maybeSingle();
    let q = supabase
      .from("play_requests")
      .select("id", { count: "exact", head: true })
      .neq("author_id", userId)
      .gt("ends_at", new Date().toISOString());
    if (seen) q = q.gt("created_at", seen.seen_at);
    const { count } = await q;
    return count ?? 0;
  }, [supabase, userId]);

  const refresh = useCallback(() => {
    fetchCount().then(setCount);
  }, [fetchCount]);

  useEffect(() => {
    const ch = supabase
      .channel(`ricerca-gioco:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "play_requests" }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, userId, fetchCount, refresh]);

  // chiuso il pannello si riconta (il segno di "visto" e' gia' salvato)
  useEffect(() => {
    if (!viewing) fetchCount().then(setCount);
  }, [viewing, fetchCount]);

  // Pannello aperto: tutte le richieste sono viste. Il segno e' l'ora dell'ultima
  // richiesta (orologio del server), cosi' un orologio del computer sbagliato non conta
  const markSeen = useCallback(async () => {
    setCount(0);
    const { data: last } = await supabase
      .from("play_requests")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last) await supabase.from("play_requests_seen").upsert({ user_id: userId, seen_at: last.created_at });
  }, [supabase, userId]);

  // mentre il pannello e' aperto non lampeggia
  return { count: viewing ? 0 : count, markSeen };
}

// Prima cosa: tutte le ricerche gioco inserite. "Nuova ricerca gioco" apre il modulo
export default function PlayRequestsPanel({
  userId,
  character,
  canModerate,
  onMessageOff,
  onSeen,
}: {
  userId: string;
  character: MainCharacter | null;
  canModerate: boolean;
  onMessageOff: (to: Contact) => void;
  onSeen: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [list, setList] = useState<PlayRequest[] | null>(null);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      supabase
        .from("play_requests")
        .select("id, author_id, text, starts_at, ends_at, created_at, character:characters(id, name, avatar_url)")
        .gt("ends_at", new Date().toISOString())
        .order("starts_at")
        .then(({ data }) => (data ?? []) as unknown as PlayRequest[]),
    [supabase],
  );

  useEffect(() => {
    load().then(setList);
    onSeen();
    // le nuove ricerche (e quelle tolte) si vedono mentre il pannello e' aperto
    const ch = supabase
      .channel(`ricerca-gioco-lista:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "play_requests" }, () => {
        load().then(setList);
        onSeen();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, userId, load, onSeen]);

  // Tolta: sparisce subito
  async function remove(r: PlayRequest) {
    if (!window.confirm("Togliere questa ricerca gioco?")) return;
    const { error } = await supabase.from("play_requests").delete().eq("id", r.id);
    if (error) setError("Ricerca gioco non tolta.");
    else setList((l) => l?.filter((x) => x.id !== r.id) ?? null);
  }

  if (writing && character)
    return (
      <PlayRequestForm
        characterId={character.id}
        onDone={(saved) => {
          setWriting(false);
          if (saved) load().then(setList);
        }}
      />
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-sm text-muted">
          Chi cerca qualcuno con cui giocare, e quando. Finita la giocata, la ricerca si toglie da sola.
        </p>
        {character?.status === "attivo" && (
          <button type="button" onClick={() => setWriting(true)} className="btn px-3 py-1.5 text-sm">
            Nuova ricerca gioco
          </button>
        )}
      </div>
      {character?.status !== "attivo" && (
        <p className="border border-orange-300/40 bg-orange-300/10 px-3 py-2 text-sm text-orange-200">
          Potrai inserire una ricerca gioco quando il tuo personaggio sarà attivo: completa la creazione del PG (clicca sulla sua immagine e
          poi su CREA PG). Intanto puoi vedere le ricerche degli altri e rispondere con un OFF.
        </p>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
      {list === null && <p className="text-sm text-muted">Caricamento...</p>}
      {list?.length === 0 && <p className="py-6 text-center text-muted">Nessuna ricerca gioco inserita.</p>}
      <ul className="space-y-2">
        {list?.map((r) => (
          <RequestRow
            key={r.id}
            r={r}
            canReply={!!character && r.author_id !== userId}
            canRemove={r.author_id === userId || canModerate}
            onReply={onMessageOff}
            onRemove={remove}
          />
        ))}
      </ul>
    </div>
  );
}

function RequestRow({
  r,
  canReply,
  canRemove,
  onReply,
  onRemove,
}: {
  r: PlayRequest;
  canReply: boolean;
  canRemove: boolean;
  onReply: (to: Contact) => void;
  onRemove: (r: PlayRequest) => void;
}) {
  const [now] = useState(() => Date.now());
  const playing = Date.parse(r.starts_at) <= now;
  const nextDay = dayLabel(r.ends_at) !== dayLabel(r.starts_at);
  return (
    <li className="flex gap-3 border border-border bg-black/40 p-3">
      <Avatar name={r.character?.name ?? "?"} url={r.character?.avatar_url} size="h-10 w-10" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-serif text-accent">{r.character?.name ?? "Personaggio"}</span>
          {playing && <span className="text-xs text-green-400">in corso</span>}
        </p>
        <p className="text-sm text-[#e2c99a]">
          {dayLabel(r.starts_at)}, dalle {time(r.starts_at)} alle {time(r.ends_at)}
          {nextDay && " del giorno dopo"}
        </p>
        <p className="mt-1 text-sm whitespace-pre-line">{r.text}</p>
        <div className="mt-2 flex gap-3 text-xs">
          {canReply && r.character && (
            <button
              type="button"
              onClick={() => onReply({ id: r.character!.id, name: r.character!.name, avatar: r.character!.avatar_url })}
              className="text-[#e2c99a] hover:text-accent"
            >
              Rispondi con un OFF
            </button>
          )}
          {canRemove && (
            <button type="button" onClick={() => onRemove(r)} className="text-red-400 hover:text-red-300">
              Togli
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

// Nuova ricerca gioco: giorno, ora di inizio e di fine previste, breve descrizione
function PlayRequestForm({ characterId, onDone }: { characterId: string; onDone: (saved: boolean) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [day, setDay] = useState(todayRome);
  const [start, setStart] = useState("21:00");
  const [end, setEnd] = useState("23:00");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // fine prima dell'inizio: la giocata finisce il giorno dopo (es. 22:00 - 01:00)
  const overnight = end <= start;

  async function publish() {
    if (!text.trim()) return setError("Scrivi una breve descrizione.");
    const startsAt = romeToDate(day, start);
    const endsAt = new Date(romeToDate(day, end).getTime() + (overnight ? 86_400_000 : 0));
    if (endsAt.getTime() <= Date.now()) return setError("L'orario di fine è già passato.");
    setBusy(true);
    setError(null);
    const { error } = await supabase.from("play_requests").insert({
      character_id: characterId,
      text: text.trim().slice(0, 500),
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
    });
    setBusy(false);
    if (error) return setError("Ricerca gioco non pubblicata (al massimo 60 giorni in anticipo).");
    onDone(true);
  }

  return (
    <div className="space-y-3">
      <h3 className="font-serif text-xl text-accent">Nuova ricerca gioco</h3>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="rg-giorno" className="text-muted">
          Giorno
        </label>
        <input id="rg-giorno" type="date" value={day} min={todayRome()} onChange={(e) => setDay(e.target.value)} className="input w-40! py-1.5" />
        <label htmlFor="rg-inizio" className="text-muted">
          dalle
        </label>
        <input id="rg-inizio" type="time" value={start} onChange={(e) => setStart(e.target.value)} className="input w-28! py-1.5" />
        <label htmlFor="rg-fine" className="text-muted">
          alle
        </label>
        <input id="rg-fine" type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="input w-28! py-1.5" />
        {overnight && <span className="text-xs text-[#e2c99a]">(finisce il giorno dopo)</span>}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={500}
        rows={4}
        placeholder="Breve descrizione: es. Cerco un incontro alla Fortezza Rossa, giocata tranquilla."
        aria-label="Descrizione"
        className="input resize-none"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={busy || !text.trim() || !day || !start || !end} onClick={publish} className="btn px-3 py-1.5 text-sm">
          Pubblica
        </button>
        <button type="button" disabled={busy} onClick={() => onDone(false)} className="btn-ghost px-3 py-1.5 text-sm">
          Annulla
        </button>
      </div>
    </div>
  );
}
