"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Highlight } from "@/components/forum/ForumHighlights";
import { createClient } from "@/lib/supabase/client";

// =====================================================================
// Tutti i contatori del gioco (icone che si accendono, numeri sui pulsanti)
// con UNA sola richiesta al database: rpc my_counters (migrazione 0180).
//
// Quando si ricontrolla:
// - all'avvio (se nel browser c'e' una copia di meno di 45 secondi, si usa quella)
// - quando arriva un avviso in tempo reale: dopo una breve attesa, cosi' piu'
//   avvisi vicini fanno una richiesta sola; al massimo una ogni 30 secondi
//   (5 secondi per le cose solo mie: missive, OFF, messaggi di sistema)
// - tornando sulla scheda, se l'ultimo controllo ha piu' di un minuto
// - ogni 5 minuti, solo con la scheda in primo piano
// - all'ora di consegna del prossimo cartiglio
// =====================================================================

export type Counters = {
  missive: number;
  next_delivery: string | null;
  off: number;
  tickets: number;
  forum: number;
  highlights: Highlight[];
  news_on: boolean;
  news_off: boolean;
  events: boolean;
  absences_new: number;
  absences_active: number;
  requests_new: number;
  requests_active: number;
  gossip: number;
};

export const EMPTY_COUNTERS: Counters = {
  missive: 0,
  next_delivery: null,
  off: 0,
  tickets: 0,
  forum: 0,
  highlights: [],
  news_on: false,
  news_off: false,
  events: false,
  absences_new: 0,
  absences_active: 0,
  requests_new: 0,
  requests_active: 0,
  gossip: 0,
};

const CACHE_MS = 45_000; // copia nel browser valida per un nuovo caricamento della pagina
const EVERY_MS = 5 * 60_000; // controllo periodico (scheda in primo piano)
const BACK_MS = 60_000; // tornando sulla scheda: solo se l'ultimo controllo e' piu' vecchio
const GAP_SHARED_MS = 30_000; // avvisi che riguardano tutti (forum, notizie, assenze...)
const GAP_MINE_MS = 5_000; // avvisi solo miei (missive, OFF): devono arrivare presto
const WAIT_MS = 2_500; // attesa per raccogliere piu' avvisi in una richiesta

const visible = () => document.visibilityState === "visible";

export type CountersApi = {
  data: Counters;
  // ricontrolla subito (dopo un'azione dell'utente: letto un messaggio, aperto un ticket...)
  refresh: () => void;
  // aggiorna un valore senza chiedere al database (es. pannello aperto = tutto visto)
  patch: (p: Partial<Counters>) => void;
};

export function useCounters(userId: string, characterId: string | null, gossip: boolean): CountersApi {
  const supabase = useMemo(() => createClient(), []);
  const key = `contatori:${userId}:${characterId ?? "-"}:${gossip ? 1 : 0}`;
  const [data, setData] = useState<Counters>(EMPTY_COUNTERS);
  const last = useRef(0); // ora dell'ultima richiesta partita
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerAt = useRef(0);
  const dirty = useRef(false); // avviso arrivato a scheda nascosta: si controlla al ritorno

  const fetchNow = useCallback(async () => {
    last.current = Date.now();
    dirty.current = false;
    const { data: res, error } = await supabase.rpc("my_counters", { p_character: characterId, p_gossip: gossip });
    if (error || !res) return;
    const next = { ...EMPTY_COUNTERS, ...(res as Partial<Counters>) };
    setData(next);
    try {
      sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data: next }));
    } catch {
      // senza memoria del browser si richiede ogni volta
    }
  }, [supabase, characterId, gossip, key]);

  // Programma un controllo tra "wait" ms, ma non prima di "gap" ms dall'ultimo.
  // Se ce n'e' gia' uno in programma che parte prima, va bene quello.
  const schedule = useCallback(
    (wait: number, gap: number) => {
      const at = Math.max(Date.now() + wait, last.current + gap);
      if (timer.current && timerAt.current <= at) return;
      if (timer.current) clearTimeout(timer.current);
      timerAt.current = at;
      timer.current = setTimeout(() => {
        timer.current = null;
        // a scheda nascosta si rimanda: al ritorno parte il controllo di "torna sulla scheda"
        if (!visible()) {
          dirty.current = true;
          return;
        }
        fetchNow();
      }, at - Date.now());
    },
    [fetchNow],
  );

  // Avvio: copia recente nel browser oppure richiesta
  useEffect(() => {
    let cached: { at: number; data: Counters } | null = null;
    try {
      const raw = sessionStorage.getItem(key);
      cached = raw ? (JSON.parse(raw) as { at: number; data: Counters }) : null;
    } catch {
      cached = null;
    }
    if (cached && Date.now() - cached.at < CACHE_MS) {
      // subito dopo l'avvio (non durante): la pagina fatta dal server parte da zero
      const saved = cached.data;
      Promise.resolve().then(() => setData({ ...EMPTY_COUNTERS, ...saved }));
      last.current = cached.at;
      schedule(CACHE_MS - (Date.now() - cached.at), 0);
    } else schedule(0, 0); // (a scheda nascosta: appena torna in primo piano)
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [key, fetchNow, schedule]);

  // Avvisi in tempo reale: non si ricarica subito, si programma un controllo
  useEffect(() => {
    const mine = () => schedule(800, GAP_MINE_MS);
    const shared = () => schedule(WAIT_MS, GAP_SHARED_MS);
    const ch = supabase.channel(`contatori:${userId}:${characterId ?? "-"}`);
    if (characterId) {
      const me = `character_id=eq.${characterId}`;
      ch.on("postgres_changes", { event: "INSERT", schema: "public", table: "private_messages", filter: `recipient_id=eq.${characterId}` }, mine)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "private_messages", filter: `recipient_id=eq.${characterId}` }, mine)
        .on("postgres_changes", { event: "*", schema: "public", table: "system_messages", filter: me }, mine)
        .on("postgres_changes", { event: "*", schema: "public", table: "off_broadcast_reads", filter: me }, mine)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "scroll_notices", filter: me }, mine)
        // gruppi OFF e messaggi a tutti: non si possono filtrare per persona
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "off_group_messages" }, shared)
        .on("postgres_changes", { event: "*", schema: "public", table: "off_group_members" }, shared)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "off_broadcasts" }, shared);
    }
    ch.on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket_messages" }, shared)
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, shared)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "forum_posts" }, shared)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "forum_posts" }, shared)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "news" }, shared)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "events" }, shared)
      .on("postgres_changes", { event: "*", schema: "public", table: "absences" }, shared)
      .on("postgres_changes", { event: "*", schema: "public", table: "play_requests" }, shared);
    if (gossip) ch.on("postgres_changes", { event: "*", schema: "public", table: "gossip_reports" }, shared);
    ch.subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, userId, characterId, gossip, schedule]);

  // Ritorno sulla scheda o sulla rete; controllo periodico a scheda visibile
  useEffect(() => {
    const onBack = () => {
      if (visible() && (dirty.current || Date.now() - last.current > BACK_MS)) schedule(0, 0);
    };
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("focus", onBack);
    window.addEventListener("online", onBack);
    const t = setInterval(() => {
      if (visible() && Date.now() - last.current >= EVERY_MS - 1000) fetchNow();
    }, EVERY_MS);
    return () => {
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("focus", onBack);
      window.removeEventListener("online", onBack);
      clearInterval(t);
    };
  }, [schedule, fetchNow]);

  // Cartiglio in arrivo: all'ora di consegna l'icona delle missive si accende
  useEffect(() => {
    if (!data.next_delivery) return;
    const wait = Math.max(0, Date.parse(data.next_delivery) - Date.now()) + 1500;
    const t = setTimeout(() => fetchNow(), Math.min(wait, 2_147_000_000));
    return () => clearTimeout(t);
  }, [data.next_delivery, fetchNow]);

  const refresh = useCallback(() => schedule(300, 0), [schedule]);
  const patch = useCallback(
    (p: Partial<Counters>) =>
      setData((d) => {
        const next = { ...d, ...p };
        try {
          sessionStorage.setItem(key, JSON.stringify({ at: last.current, data: next }));
        } catch {
          // niente
        }
        return next;
      }),
    [key],
  );

  return useMemo(() => ({ data, refresh, patch }), [data, refresh, patch]);
}
