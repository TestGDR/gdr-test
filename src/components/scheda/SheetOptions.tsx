"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  playEvent,
  playSound,
  soundsOf,
  type SoundGroup,
} from "@/lib/notify-sound";
import {
  applyPrefs,
  DEFAULT_PREFS,
  loadPrefs,
  savePrefs,
  TEXT_SCALES,
  type Prefs,
} from "@/lib/prefs";
import { createClient } from "@/lib/supabase/client";

// Colori proposti per il testo della chat (si puo' anche scegliere un colore libero)
const SPEECH_COLORS = [
  "#fde68a",
  "#f0c75e",
  "#ffffff",
  "#9fd3ff",
  "#b6e3a8",
  "#f4a3a3",
  "#d7b8ff",
];
const ACTION_COLORS = [
  "#e4dfdb",
  "#ffffff",
  "#c9c2bc",
  "#d8c39a",
  "#a9b8c9",
  "#c9b48a",
  "#bfbfbf",
];

// Scheda -> Opzioni (solo sulla propria): suoni, grandezza del testo, colori
// della chat. Valgono per l'account, su ogni dispositivo.
export default function SheetOptions() {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saved, setSaved] = useState<Prefs | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Uscendo dalle Opzioni senza salvare si torna a quelle salvate
  const savedRef = useRef<Prefs | null>(null);
  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);
  useEffect(
    () => () => {
      if (savedRef.current) applyPrefs(savedRef.current);
    },
    [],
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? null;
      setUserId(id);
      if (id)
        loadPrefs(supabase, id).then((p) => {
          setPrefs(p);
          setSaved(p);
        });
    });
  }, [supabase]);

  if (!prefs || !userId)
    return <p className="p-6 text-muted">Caricamento...</p>;
  const set = (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    applyPrefs(next); // si vede (e si sente) subito; si conserva con Salva
    setMsg(null);
  };
  const changed = JSON.stringify(prefs) !== JSON.stringify(saved);

  async function save() {
    if (!prefs || !userId) return;
    setBusy(true);
    const ok = await savePrefs(supabase, userId, prefs);
    setBusy(false);
    setMsg(
      ok
        ? { ok: true, text: "Opzioni salvate." }
        : { ok: false, text: "Opzioni non salvate." },
    );
    if (ok) setSaved(prefs);
  }

  function cancel() {
    if (!saved) return;
    setPrefs(saved);
    applyPrefs(saved);
  }

  return (
    <div className="space-y-5 p-6">
      <h3 className="border-b border-border pb-2 font-serif text-2xl text-accent">
        Opzioni
      </h3>
      <p className="-mt-3 text-xs text-muted">
        Valgono per il tuo account, su qualsiasi computer o telefono.
      </p>

      {/* Suoni */}
      <section className="space-y-3">
        <h4 className="font-serif text-lg text-[#d8c39a]">Suoni</h4>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-[var(--accent)]"
            checked={prefs.sounds_on}
            onChange={(e) => set({ sounds_on: e.target.checked })}
          />
          Suoni della land attivi
        </label>
        <div
          className={`space-y-3 ${prefs.sounds_on ? "" : "pointer-events-none opacity-40"}`}
        >
          {/* Volume generale della land */}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-xs tracking-wider text-muted uppercase">
              Volume
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={prefs.volume}
              onChange={(e) => set({ volume: Number(e.target.value) })}
              aria-label="Volume dei suoni"
              className="w-48 accent-[var(--accent)]"
            />
            <span className="w-10 text-accent">{prefs.volume}%</span>
            <button
              type="button"
              onClick={() => playEvent("off")}
              className="btn-ghost px-2 py-1 text-xs"
            >
              ▶ Prova
            </button>
          </div>
          <SoundPicker
            label="Missive (messaggi ON)"
            group="missiva"
            value={prefs.sound_missiva}
            onChange={(v) => set({ sound_missiva: v })}
          />
          <SoundPicker
            label="Messaggi OFF e ticket"
            group="off"
            value={prefs.sound_off}
            onChange={(v) => set({ sound_off: v })}
          />
          <div>
            <label className="mb-1 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-[var(--accent)]"
                checked={prefs.chat_sound_on}
                onChange={(e) => set({ chat_sound_on: e.target.checked })}
              />
              Suono quando arriva un messaggio in chat
            </label>
            <div
              className={
                prefs.chat_sound_on ? "" : "pointer-events-none opacity-40"
              }
            >
              <SoundPicker
                label="Chat"
                group="chat"
                value={prefs.sound_chat}
                onChange={(v) => set({ sound_chat: v })}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Testo */}
      <section className="space-y-2">
        <h4 className="font-serif text-lg text-[#d8c39a]">
          Grandezza del testo
        </h4>
        <div className="flex flex-wrap gap-2">
          {TEXT_SCALES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => set({ text_scale: s.value })}
              className={`border px-3 py-1.5 text-sm ${
                prefs.text_scale === s.value
                  ? "border-accent bg-blood/20 text-accent"
                  : "border-border text-muted hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">
          Ingrandisce tutto il sito, finestre comprese.
        </p>
      </section>

      {/* Colori della chat */}
      <section className="space-y-3">
        <h4 className="font-serif text-lg text-[#d8c39a]">Colori della chat</h4>
        <ColorPicker
          label="Parlato (il testo tra virgolette)"
          colors={SPEECH_COLORS}
          value={prefs.speech_color}
          onChange={(v) => set({ speech_color: v })}
        />
        <ColorPicker
          label="Azione"
          colors={ACTION_COLORS}
          value={prefs.action_color}
          onChange={(v) => set({ action_color: v })}
        />
        <div className="border border-border/60 bg-black/40 px-3 py-2 text-sm leading-relaxed">
          <span className="mr-2 text-xs text-muted">21:30</span>
          <strong className="font-serif text-accent">Daemon</strong>{" "}
          <span style={{ color: prefs.action_color }}>
            posa il calice sul tavolo e si volta verso la finestra.{" "}
            <span
              className="font-semibold"
              style={{ color: prefs.speech_color }}
            >
              «Il vento porta notizie da Nord.»
            </span>
          </span>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
        <button
          type="button"
          disabled={busy || !changed}
          onClick={save}
          className="btn px-5 py-1.5 text-sm"
        >
          {busy ? "Salvataggio..." : "Salva"}
        </button>
        {changed && (
          <button
            type="button"
            onClick={cancel}
            className="btn-ghost px-4 py-1.5 text-sm"
          >
            Annulla le modifiche
          </button>
        )}
        <button
          type="button"
          onClick={() => set({ ...DEFAULT_PREFS })}
          className="ml-auto text-xs text-muted hover:text-accent"
        >
          Ripristina le impostazioni iniziali
        </button>
        {msg && (
          <span
            className={`w-full text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}
          >
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}

function SoundPicker({
  label,
  group,
  value,
  onChange,
}: {
  label: string;
  group: SoundGroup;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-xs tracking-wider text-muted uppercase">
        {label}
      </p>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {soundsOf(group).map((s) => (
          <li
            key={s.id}
            className={`flex items-center gap-2 border px-2 py-1.5 ${value === s.id ? "border-accent bg-blood/15" : "border-border/60"}`}
          >
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                className="accent-[var(--accent)]"
                name={`suono-${group}`}
                checked={value === s.id}
                onChange={() => onChange(s.id)}
              />
              <span className="truncate">{s.label}</span>
            </label>
            <button
              type="button"
              onClick={() => playSound(s.id)}
              title="Prova il suono"
              aria-label={`Prova: ${s.label}`}
              className="shrink-0 px-1.5 text-muted hover:text-accent"
            >
              ▶
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ColorPicker({
  label,
  colors,
  value,
  onChange,
}: {
  label: string;
  colors: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-xs tracking-wider text-muted uppercase">
        {label}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-label={`Colore ${c}`}
            className={`h-7 w-7 rounded-full border-2 ${value.toLowerCase() === c ? "border-accent" : "border-black/60"}`}
            style={{ background: c }}
          />
        ))}
        <label className="flex items-center gap-1 text-xs text-muted">
          altro
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-7 w-10 cursor-pointer border border-border bg-transparent"
          />
        </label>
      </div>
    </div>
  );
}
