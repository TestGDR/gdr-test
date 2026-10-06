"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { setSoundPrefs, soundOr } from "./notify-sound";

// Preferenze dell'account (scheda -> Opzioni): suoni, grandezza del testo,
// colori del parlato e delle azioni in chat. Salvate nel database (user_prefs)
// e copiate nel browser per applicarle subito al caricamento della pagina.
export type Prefs = {
  sounds_on: boolean;
  volume: number; // 0-100
  sound_missiva: string;
  sound_off: string;
  sound_chat: string;
  chat_sound_on: boolean;
  text_scale: number; // percento: 100 = normale
  speech_color: string; // parlato in chat (tra virgolette)
  action_color: string; // testo dell'azione in chat
};

export const DEFAULT_PREFS: Prefs = {
  sounds_on: true,
  volume: 80,
  sound_missiva: "file-corvo",
  sound_off: "file-bip1",
  sound_chat: "file-chat1",
  chat_sound_on: true,
  text_scale: 100,
  speech_color: "#fde68a",
  action_color: "#e4dfdb",
};

export const TEXT_SCALES = [
  { value: 90, label: "Piccolo" },
  { value: 100, label: "Normale" },
  { value: 112, label: "Grande" },
  { value: 125, label: "Più grande" },
  { value: 140, label: "Molto grande" },
];

const KEY = "westeros-preferenze";

// Applica le preferenze alla pagina: variabili CSS e suoni
export function applyPrefs(p: Prefs) {
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  root.setProperty("--text-scale", String(p.text_scale / 100));
  root.setProperty("--chat-speech", p.speech_color);
  root.setProperty("--chat-action", p.action_color);
  setSoundPrefs({
    on: p.sounds_on,
    volume: p.volume,
    missiva: p.sound_missiva,
    off: p.sound_off,
    chat: p.sound_chat,
    chatOn: p.chat_sound_on,
  });
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // senza localStorage si riapplicano al prossimo caricamento dal database
  }
}

// Subito, dal browser (prima che risponda il database)
export function cachedPrefs(): Prefs | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw
      ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) }
      : null;
  } catch {
    return null;
  }
}

export async function loadPrefs(
  supabase: SupabaseClient,
  userId: string,
): Promise<Prefs> {
  const { data } = await supabase
    .from("user_prefs")
    .select(
      "sounds_on, volume, sound_missiva, sound_off, sound_chat, chat_sound_on, text_scale, speech_color, action_color",
    )
    .eq("user_id", userId)
    .maybeSingle();
  const p = { ...DEFAULT_PREFS, ...((data as Partial<Prefs> | null) ?? {}) };
  // suoni salvati che non esistono piu': il primo della loro lista
  return {
    ...p,
    sound_missiva: soundOr(p.sound_missiva, "missiva"),
    sound_off: soundOr(p.sound_off, "off"),
    sound_chat: soundOr(p.sound_chat, "chat"),
  };
}

export async function savePrefs(
  supabase: SupabaseClient,
  userId: string,
  p: Prefs,
) {
  const { error } = await supabase
    .from("user_prefs")
    .upsert({ user_id: userId, ...p, updated_at: new Date().toISOString() });
  return !error;
}
