"use client";

import { useEffect, useMemo, useState } from "react";
import { isAvailability, type Availability } from "@/lib/availability";
import { createClient } from "@/lib/supabase/client";

// Chi e' "in cerca di gioco" va in cima, poi in ordine alfabetico
export function byAvailabilityThenName(a: OnlinePlayer, b: OnlinePlayer) {
  const rank = (p: OnlinePlayer) => (p.availability === "cerca" ? 0 : 1);
  return rank(a) - rank(b) || a.name.localeCompare(b.name);
}

// Cosa ogni giocatore online condivide con gli altri (Supabase Realtime Presence)
export type OnlinePlayer = {
  availability: Availability;
  userId: string;
  characterId: string | null;
  name: string;
  avatar: string | null;
  role: "player" | "master" | "admin";
  active: boolean; // PG attivo (creazione completata)
  phrase: string;
  place: "mappa" | "chat";
  placeKey: string; // "mappa" oppure "chat:<id lista>": chi ha la stessa chiave e' nello stesso posto
  placeLabel: string; // nome del posto (mappa, luogo o lista)
};

export function usePresence(me: OnlinePlayer) {
  const supabase = useMemo(() => createClient(), []);
  const [online, setOnline] = useState<OnlinePlayer[]>([]);
  const [channel, setChannel] = useState<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const ch = supabase.channel("online", { config: { presence: { key: me.userId } } });
    ch.on("presence", { event: "sync" }, () => {
      // Una voce per utente: con piu' schede aperte vale l'ultima.
      // L'id utente si prende dalla chiave della presenza (sempre presente e unica),
      // non dal contenuto: una scheda aperta con una versione vecchia del sito
      // potrebbe inviare dati incompleti.
      const state = ch.presenceState<Partial<OnlinePlayer>>();
      setOnline(
        Object.entries(state).map(([key, entries]) => {
          const p = entries[entries.length - 1];
          return {
            userId: key,
            availability: isAvailability(p.availability) ? p.availability : "disponibile",
            characterId: p.characterId ?? null,
            name: p.name ?? "?",
            avatar: p.avatar ?? null,
            role: p.role ?? "player",
            active: p.active ?? false,
            phrase: p.phrase ?? "",
            place: p.place ?? "mappa",
            placeKey: p.placeKey ?? "mappa",
            placeLabel: p.placeLabel ?? "",
          };
        }),
      );
    }).subscribe((status) => {
      if (status === "SUBSCRIBED") setChannel(ch);
    });
    return () => {
      setChannel(null);
      supabase.removeChannel(ch);
    };
  }, [supabase, me.userId]);

  // Ogni volta che cambio posto, nome, frase... aggiorno cio' che vedono gli altri
  const payload = JSON.stringify(me);
  useEffect(() => {
    channel?.track(JSON.parse(payload));
  }, [channel, payload]);

  return useMemo(() => [...online].sort(byAvailabilityThenName), [online]);
}
