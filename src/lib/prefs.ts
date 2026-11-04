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
  // Aspetto della chat (strumento "Aspetto" della chat): solo i messaggi della chat
  chat_font_pt: number | null; // grandezza del testo in pt; null = automatica (segue lo schermo)
  chat_font: ChatFont;
  chat_name_color: string; // nomi dei personaggi nei messaggi
  chat_tag_color: string; // testo tra [ ] in chat
};

// Grandezza del testo della chat in pt: limiti e misure pronte
export const CHAT_PT_MIN = 8;
export const CHAT_PT_MAX = 30;
export const CHAT_PT_PRESETS = [10, 11, 12, 13, 14, 16, 18];

export type ChatFont = "mukta" | "open-sans" | "lora" | "georgia";
export const CHAT_FONTS: { value: ChatFont; label: string; css: string }[] = [
  { value: "mukta", label: "Mukta (predefinito)", css: "var(--font-chat)" },
  { value: "open-sans", label: "Open Sans", css: "var(--font-body)" },
  { value: "lora", label: "Lora", css: "var(--font-lora)" },
  { value: "georgia", label: "Georgia", css: "Georgia, serif" },
];

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
  chat_font_pt: null,
  chat_font: "mukta",
  chat_name_color: "#d4b394",
  chat_tag_color: "#9fb8cf",
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
  if (p.chat_font_pt) root.setProperty("--chat-size", `${p.chat_font_pt}pt`);
  else root.removeProperty("--chat-size");
  root.setProperty(
    "--chat-font",
    (CHAT_FONTS.find((f) => f.value === p.chat_font) ?? CHAT_FONTS[0]).css,
  );
  root.setProperty("--chat-name", p.chat_name_color);
  root.setProperty("--chat-tag", p.chat_tag_color);
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
      "sounds_on, volume, sound_missiva, sound_off, sound_chat, chat_sound_on, text_scale, speech_color, action_color, chat_font_pt, chat_font, chat_name_color, chat_tag_color",
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
