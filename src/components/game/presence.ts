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
  live: boolean; // sempre true: si e' presenti fino a un'ora dall'ultima azione
  invisible?: boolean; // staff invisibile: lo vede solo chi ha lo stesso permesso
};

export type PresencePayload = Omit<OnlinePlayer, "live">;

// Richieste al database tenute basse (consumi di Supabase): il "dal vivo" arriva
// dal canale in tempo reale, il database serve solo per chi non e' collegato adesso.
// Battito e rilettura partono solo con la scheda in primo piano.
const HEARTBEAT_MS = 5 * 60_000; // ogni quanto si lascia il segnale nel database
const POLL_MS = 2 * 60_000; // ogni quanto si rilegge chi ha fatto un'azione nell'ultima ora
const RECENT_MIN_GAP_MS = 30_000; // riletture per entrate e uscite: al massimo una ogni 30 s
const TOUCH_DEBOUNCE_MS = 1_500; // cambio di pagina: un solo segnale con titolo e posto gia' giusti
const RETRY_MS = 4_000; // dopo quanto si ricrea il collegamento in tempo reale caduto
const visible = () => typeof document === "undefined" || document.visibilityState === "visible";

// Dati arrivati da altri browser: completati con valori neutri se mancano
function normalize(
  userId: string,
  p: Partial<OnlinePlayer>,
  live: boolean,
): OnlinePlayer {
  return {
    userId,
    availability: isAvailability(p.availability)
      ? p.availability
      : "disponibile",
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
    invisible: !!p.invisible,
    live,
  };
}

// Online = connesso adesso (tempo reale: entrate e cambi di posto istantanei)
//        + chi ha fatto un'azione nel sito nell'ultima ora (cambiare pagina, aggiornare,
//          scrivere in chat, missive e OFF): una scheda in secondo piano o un telefono in
//          standby non fanno sparire nessuno. Si sparisce subito solo con Esci.
// invisible: non ci si annuncia in tempo reale (il canale e' di tutti); resta il
// segnale nel database, che il database mostra solo a chi puo' vederlo
export function usePresence(me: PresencePayload, invisible = false) {
  const supabase = useMemo(() => createClient(), []);
  const [live, setLive] = useState<OnlinePlayer[]>([]);
  const [recent, setRecent] = useState<OnlinePlayer[]>([]);
  const [channel, setChannel] = useState<ReturnType<
    typeof supabase.channel
  > | null>(null);
  // Cambia per ricreare da zero il collegamento in tempo reale quando cade
  const [attempt, setAttempt] = useState(0);
  // Ultimi dati da annunciare: servono anche dopo una riconnessione
  const payload = JSON.stringify(me);
  const latest = useRef(payload);
  const hidden = useRef(invisible);
  useEffect(() => {
    latest.current = payload;
    hidden.current = invisible;
  }, [payload, invisible]);

  // Chi ha dato segnale negli ultimi 5 minuti (ora decisa dal database)
  const refreshRecent = useCallback(
    () =>
      supabase.rpc("recent_online").then(({ data }) => {
        if (!data) return;
        // il database restituisce chi ha fatto un'azione nell'ultima ora: tutti presenti
        setRecent(
          (data as { user_id: string; info: Partial<OnlinePlayer> }[]).map(
            (r) => normalize(r.user_id, r.info, true),
          ),
        );
      }),
    [supabase],
  );

  // Rilettura "presto" (entrate, uscite, ritorno sulla scheda): al massimo una ogni
  // 30 secondi; se ne arrivano altre nel frattempo, una sola alla fine dell'attesa
  const lastRecent = useRef(0);
  const pendingRecent = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshRecentSoon = useCallback(
    (delay = 1500) => {
      if (pendingRecent.current) return;
      const wait = Math.max(delay, lastRecent.current + RECENT_MIN_GAP_MS - Date.now());
      pendingRecent.current = setTimeout(() => {
        pendingRecent.current = null;
        if (!visible()) return;
        lastRecent.current = Date.now();
        refreshRecent();
      }, wait);
    },
    [refreshRecent],
  );
  useEffect(
    () => () => {
      if (pendingRecent.current) clearTimeout(pendingRecent.current);
    },
    [],
  );

  // --- Tempo reale -------------------------------------------------------
  useEffect(() => {
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const ch = supabase.channel("online", {
      config: { presence: { key: me.userId } },
    });
    let keys = "";
    ch.on("presence", { event: "sync" }, () => {
      // Una voce per utente (con piu' schede vale l'ultima); l'id dalla chiave della presenza
      const state = ch.presenceState<Partial<OnlinePlayer>>();
      setLive(
        Object.entries(state).map(([key, entries]) =>
          normalize(key, entries[entries.length - 1], true),
        ),
      );
      // Qualcuno e' entrato o uscito (non un semplice cambio di pagina): rileggo
      // anche i segnali, chi ha chiuso il sito ha appena spento il suo
      const now = Object.keys(state).sort().join(",");
      if (now !== keys) {
        if (keys) refreshRecentSoon();
        keys = now;
      }
    }).subscribe((status) => {
      if (disposed) return;
      if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        // Collegamento caduto e non ripreso: lo ricreo da zero tra poco
        setChannel(null);
        clearTimeout(retry);
        retry = setTimeout(() => setAttempt((a) => a + 1), RETRY_MS);
        return;
      }
      if (status !== "SUBSCRIBED") return;
      setChannel(ch);
      // Dopo una caduta Supabase si ricollega da solo ma NON ripete l'annuncio: lo rifacciamo
      if (!hidden.current) ch.track(JSON.parse(latest.current));
    });

    return () => {
      disposed = true;
      clearTimeout(retry);
      setChannel(null);
      supabase.removeChannel(ch);
    };
  }, [supabase, me.userId, refreshRecentSoon, attempt]);

  // --- Segnale nel database ----------------------------------------------
  useEffect(() => {
    const beat = () =>
      supabase.rpc("touch_online", {
        p_info: JSON.parse(latest.current),
        p_action: false,
      });
    const loadRecent = () => {
      lastRecent.current = Date.now();
      return refreshRecent();
    };

    // all'apertura: subito la lista (il segnale con l'azione lo manda l'effetto del posto)
    loadRecent();
    const beatTimer = setInterval(() => visible() && beat(), HEARTBEAT_MS);
    const pollTimer = setInterval(() => visible() && loadRecent(), POLL_MS);

    // Tornando sulla scheda o quando torna la rete: annuncio e lista aggiornata
    // (la lista al massimo ogni 30 secondi: il "focus" capita spesso)
    let lastBack = 0;
    const onBack = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastBack > RECENT_MIN_GAP_MS) {
        lastBack = Date.now();
        beat();
        refreshRecentSoon(0);
      }
      const ch = supabase
        .getChannels()
        .find((c) => c.topic === "realtime:online");
      // Collegamento in tempo reale non attivo (es. dopo ore in secondo piano): lo ricreo
      if (!ch || ch.state !== "joined") setAttempt((a) => a + 1);
      else if (!hidden.current) ch.track(JSON.parse(latest.current));
    };

    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("online", onBack);
    return () => {
      clearInterval(beatTimer);
      clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("online", onBack);
    };
  }, [supabase, refreshRecent, refreshRecentSoon]);

  // Ogni volta che cambio posto, frase, disponibilita'... aggiorno subito cio' che vedono
  // gli altri. Cambiare pagina o frase e' un'azione: tiene presenti per un'altra ora.
  useEffect(() => {
    if (invisible) channel?.untrack();
    else channel?.track(JSON.parse(payload));
  }, [channel, payload, invisible]);
  // Nel database un solo segnale per cambio di pagina: il titolo del posto arriva
  // un attimo dopo l'indirizzo, si aspetta che sia tutto pronto
  useEffect(() => {
    const t = setTimeout(
      () =>
        supabase.rpc("touch_online", {
          p_info: JSON.parse(payload),
          p_action: true,
        }),
      TOUCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(t);
  }, [supabase, payload]);

  return useMemo(() => {
    const liveIds = new Set(live.map((p) => p.userId));
    // "invisibile" lo sa il database (il tempo reale non lo porta); io lo so da me
    const hiddenIds = new Set(recent.filter((p) => p.invisible).map((p) => p.userId));
    const mark = (p: OnlinePlayer): OnlinePlayer => ({
      ...p,
      invisible: p.userId === me.userId ? invisible : p.invisible || hiddenIds.has(p.userId),
    });
    return [...live, ...recent.filter((p) => !liveIds.has(p.userId))]
      .map(mark)
      .sort(byAvailabilityThenName);
  }, [live, recent, me.userId, invisible]);
}
