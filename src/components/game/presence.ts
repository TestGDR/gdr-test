"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Cosa ogni giocatore online condivide con gli altri (Supabase Realtime Presence)
export type OnlinePlayer = {
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
      // Una voce per utente: con piu' schede aperte vale l'ultima
      const state = ch.presenceState<OnlinePlayer>();
      setOnline(Object.values(state).map((entries) => entries[entries.length - 1]));
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

  return useMemo(() => [...online].sort((a, b) => a.name.localeCompare(b.name)), [online]);
}
