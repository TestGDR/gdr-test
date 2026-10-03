"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MainCharacter } from "@/lib/main-character";
import { Avatar, type Contact } from "./MessagesModal";

type PlayRequest = {
  id: string;
  author_id: string;
  text: string;
  expires_at: string;
  created_at: string;
  character: { id: string; name: string; avatar_url: string | null } | null;
};

const DURATIONS = [2, 6, 12, 24];
const time = (iso: string) => new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

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
      .gt("expires_at", new Date().toISOString());
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
  const [text, setText] = useState("");
  const [hours, setHours] = useState(6);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      supabase
        .from("play_requests")
        .select("id, author_id, text, expires_at, created_at, character:characters(id, name, avatar_url)")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .then(({ data }) => (data ?? []) as unknown as PlayRequest[]),
    [supabase],
  );

  useEffect(() => {
    load().then(setList);
    onSeen();
    // le nuove richieste compaiono mentre il pannello e' aperto
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

  async function publish() {
    if (!character || !text.trim()) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.from("play_requests").insert({
      character_id: character.id,
      text: text.trim().slice(0, 500),
      expires_at: new Date(Date.now() + hours * 3600_000).toISOString(),
    });
    setBusy(false);
    if (error) return setError("Richiesta non pubblicata.");
    setText("");
    load().then(setList);
  }

  async function remove(r: PlayRequest) {
    if (!window.confirm("Togliere questa richiesta di gioco?")) return;
    const { error } = await supabase.from("play_requests").delete().eq("id", r.id);
    if (error) setError("Richiesta non tolta.");
    else setList((l) => l?.filter((x) => x.id !== r.id) ?? null);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Cerchi qualcuno con cui giocare? Scrivi una richiesta: resta visibile a tutti per le ore che scegli. Gli altri ti
        possono rispondere con un messaggio OFF.
      </p>

      {character?.status === "attivo" ? (
        <div className="space-y-2 border border-border bg-black/40 p-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Es. Cerco un incontro alla Fortezza Rossa, giocata tranquilla di sera."
            aria-label="Testo della richiesta"
            className="input resize-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-muted" htmlFor="durata-richiesta">
              Visibile per
            </label>
            <select id="durata-richiesta" value={hours} onChange={(e) => setHours(Number(e.target.value))} className="input w-28! py-1.5">
              {DURATIONS.map((h) => (
                <option key={h} value={h}>
                  {h} ore
                </option>
              ))}
            </select>
            <button type="button" disabled={busy || !text.trim()} onClick={publish} className="btn ml-auto px-3 py-1.5 text-sm">
              Pubblica
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-orange-300">Potrai pubblicare richieste di gioco quando il tuo personaggio sarà attivo.</p>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
      {list === null && <p className="text-sm text-muted">Caricamento...</p>}
      {list?.length === 0 && <p className="py-6 text-center text-muted">Nessuna richiesta di gioco in questo momento.</p>}
      <ul className="space-y-2">
        {list?.map((r) => {
          const mine = r.author_id === userId;
          return (
            <li key={r.id} className="flex gap-3 border border-border bg-black/40 p-3">
              <Avatar name={r.character?.name ?? "?"} url={r.character?.avatar_url} size="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-serif text-accent">{r.character?.name ?? "Personaggio"}</span>
                  <span className="text-xs text-muted">
                    alle {time(r.created_at)} · fino alle {time(r.expires_at)}
                  </span>
                </p>
                <p className="mt-1 text-sm whitespace-pre-line">{r.text}</p>
                <div className="mt-2 flex gap-3 text-xs">
                  {!mine && r.character && character && (
                    <button
                      type="button"
                      onClick={() => onMessageOff({ id: r.character!.id, name: r.character!.name, avatar: r.character!.avatar_url })}
                      className="text-[#e2c99a] hover:text-accent"
                    >
                      Rispondi con un OFF
                    </button>
                  )}
                  {(mine || canModerate) && (
                    <button type="button" onClick={() => remove(r)} className="text-red-400 hover:text-red-300">
                      Togli
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
