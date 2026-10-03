"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isAvailability, type Availability } from "@/lib/availability";
import { createClient } from "@/lib/supabase/client";

// Chi e' "in cerca di gioco" va in cima, poi in ordine alfabetico
export function byAvailabilityThenName(a: OnlinePlayer, b: OnlinePlayer) {
  const rank = (p: OnlinePlayer) => (p.availability === "cerca" ? 0 : 1);
  return rank(a) - rank(b) || a.name.localeCompare(b.name);
}

// Cosa ogni giocatore online condivide con gli altri
export type OnlinePlayer = {
  availability: Availability;
  userId: string;
  characterId: string | null;
  name: string;
  avatar: string | null;
  staffRole: string | null; // nome del ruolo staff ("Admin" per il super-utente), null = giocatore
  staffColor: string | null;
  active: boolean; // PG attivo (creazione completata)
  phrase: string;
  house: string | null; // casata (cognome)
  sigil: string | null; // stemma della casata
  place: "mappa" | "chat";
  placeKey: string; // "mappa" oppure "chat:<id lista>": chi ha la stessa chiave e' nello stesso posto
  placeLabel: string; // nome del posto (mappa, luogo o lista)
  live: boolean; // connesso adesso; false = connessione persa da poco (segnale < 5 minuti)
};

export type PresencePayload = Omit<OnlinePlayer, "live">;

const HEARTBEAT_MS = 60_000; // ogni quanto si lascia il segnale nel database
const POLL_MS = 20_000; // ogni quanto si rilegge chi ha dato segnale di recente
// Segnale piu' recente di cosi' = presente a tutti gli effetti, anche se il suo
// collegamento in tempo reale e' caduto (il segnale arriva ogni minuto)
const FRESH_MS = 150_000;
const RETRY_MS = 4_000; // dopo quanto si ricrea il collegamento in tempo reale caduto

// Dati arrivati da altri browser: completati con valori neutri se mancano
function normalize(userId: string, p: Partial<OnlinePlayer>, live: boolean): OnlinePlayer {
  return {
    userId,
    availability: isAvailability(p.availability) ? p.availability : "disponibile",
    characterId: p.characterId ?? null,
    name: p.name ?? "?",
    avatar: p.avatar ?? null,
    staffRole: p.staffRole ?? null,
    staffColor: p.staffColor ?? null,
    active: p.active ?? false,
    phrase: p.phrase ?? "",
    house: p.house ?? null,
    sigil: p.sigil ?? null,
    place: p.place ?? "mappa",
    placeKey: p.placeKey ?? "mappa",
    placeLabel: p.placeLabel ?? "",
    live,
  };
}

// Online = connesso adesso (tempo reale: entrate e uscite istantanee)
//        + chi ha lasciato un segnale negli ultimi 5 minuti (un calo di
//          connessione non fa sparire nessuno; chi chiude il sito avvisa e sparisce subito)
export function usePresence(me: PresencePayload) {
  const supabase = useMemo(() => createClient(), []);
  const [live, setLive] = useState<OnlinePlayer[]>([]);
  const [recent, setRecent] = useState<OnlinePlayer[]>([]);
  const [channel, setChannel] = useState<ReturnType<typeof supabase.channel> | null>(null);
  // Cambia per ricreare da zero il collegamento in tempo reale quando cade
  const [attempt, setAttempt] = useState(0);
  // Ultimi dati da annunciare: servono anche dopo una riconnessione
  const payload = JSON.stringify(me);
  const latest = useRef(payload);
  useEffect(() => {
    latest.current = payload;
  }, [payload]);

  // Chi ha dato segnale negli ultimi 5 minuti (ora decisa dal database)
  const refreshRecent = useCallback(
    () =>
      supabase.rpc("recent_online").then(({ data }) => {
        if (!data) return;
        const now = Date.now();
        setRecent(
          (data as { user_id: string; info: Partial<OnlinePlayer>; last_seen: string }[]).map((r) =>
            normalize(r.user_id, r.info, now - new Date(r.last_seen).getTime() < FRESH_MS),
          ),
        );
      }),
    [supabase],
  );

  // --- Tempo reale -------------------------------------------------------
  useEffect(() => {
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const ch = supabase.channel("online", { config: { presence: { key: me.userId } } });
    ch.on("presence", { event: "sync" }, () => {
      // Una voce per utente (con piu' schede vale l'ultima); l'id dalla chiave della presenza
      const state = ch.presenceState<Partial<OnlinePlayer>>();
      setLive(Object.entries(state).map(([key, entries]) => normalize(key, entries[entries.length - 1], true)));
      // Qualcuno e' entrato o uscito: rileggo presto anche i segnali (chi ha chiuso il
      // sito ha appena spento il suo), cosi' l'uscita si vede subito
      setTimeout(refreshRecent, 1500);
    }).subscribe((status) => {
      if (disposed) return;
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        // Collegamento caduto e non ripreso: lo ricreo da zero tra poco
        setChannel(null);
        clearTimeout(retry);
        retry = setTimeout(() => setAttempt((a) => a + 1), RETRY_MS);
        return;
      }
      if (status !== "SUBSCRIBED") return;
      setChannel(ch);
      // Dopo una caduta Supabase si ricollega da solo ma NON ripete l'annuncio: lo rifacciamo
      ch.track(JSON.parse(latest.current));
    });

    return () => {
      disposed = true;
      clearTimeout(retry);
      setChannel(null);
      supabase.removeChannel(ch);
    };
  }, [supabase, me.userId, refreshRecent, attempt]);

  // --- Segnale nel database ----------------------------------------------
  useEffect(() => {
    const beat = () => supabase.rpc("touch_online", { p_info: JSON.parse(latest.current) });
    const loadRecent = refreshRecent;

    beat().then(loadRecent);
    const beatTimer = setInterval(beat, HEARTBEAT_MS);
    const pollTimer = setInterval(loadRecent, POLL_MS);

    // Tornando sulla scheda o quando torna la rete: subito segnale, annuncio e lista aggiornata
    const onBack = () => {
      if (document.visibilityState !== "visible") return;
      beat().then(loadRecent);
      const ch = supabase.getChannels().find((c) => c.topic === "realtime:online");
      // Collegamento in tempo reale non attivo (es. dopo ore in secondo piano): lo ricreo
      if (!ch || ch.state !== "joined") setAttempt((a) => a + 1);
      else ch.track(JSON.parse(latest.current));
    };
    // Chiudendo il sito (non quando si mette in pausa): segnale spento, si sparisce subito
    const onLeave = () => navigator.sendBeacon("/api/presenza/esci");

    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("online", onBack);
    window.addEventListener("pagehide", onLeave);
    return () => {
      clearInterval(beatTimer);
      clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("online", onBack);
      window.removeEventListener("pagehide", onLeave);
    };
  }, [supabase, refreshRecent]);

  // Ogni volta che cambio posto, nome, frase... aggiorno subito cio' che vedono gli altri
  useEffect(() => {
    channel?.track(JSON.parse(payload));
    supabase.rpc("touch_online", { p_info: JSON.parse(payload) });
  }, [supabase, channel, payload]);

  return useMemo(() => {
    const liveIds = new Set(live.map((p) => p.userId));
    return [...live, ...recent.filter((p) => !liveIds.has(p.userId))].sort(byAvailabilityThenName);
  }, [live, recent]);
}
