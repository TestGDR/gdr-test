"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ACTION_COLORS,
  ColorPicker,
  SPEECH_COLORS,
} from "@/components/scheda/SheetOptions";
import {
  applyPrefs,
  CHAT_FONTS,
  CHAT_PT_MAX,
  CHAT_PT_MIN,
  CHAT_PT_PRESETS,
  DEFAULT_PREFS,
  loadPrefs,
  savePrefs,
  type ChatFont,
  type Prefs,
} from "@/lib/prefs";
import { createClient } from "@/lib/supabase/client";

const TAG_COLORS = ["#9fb8cf", "#a9c9a4", "#c9a4d8", "#d8b26a", "#c9c2bc", "#ffffff", "#e08f7a"];
const NAME_COLORS = ["#d4b394", "#f0c75e", "#ffffff", "#e4dfdb", "#c97a7a", "#9fd3ff", "#b6e3a8"];

// Campi di questa finestra: tutto il resto delle preferenze resta com'e'
type ChatLook = Pick<
  Prefs,
  "chat_font_pt" | "chat_font" | "chat_name_color" | "chat_tag_color" | "speech_color" | "action_color"
>;
const pick = (p: Prefs): ChatLook => ({
  chat_font_pt: p.chat_font_pt,
  chat_font: p.chat_font,
  chat_name_color: p.chat_name_color,
  chat_tag_color: p.chat_tag_color,
  speech_color: p.speech_color,
  action_color: p.action_color,
});

// Strumento "Aspetto" della chat: grandezza del testo, carattere e colori
// dei soli messaggi della chat. Vale per l'account, su ogni dispositivo.
export default function ChatAppearance({ onClose }: { onClose: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saved, setSaved] = useState<Prefs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Grandezza "automatica" di adesso, in pt: dipende dallo schermo (testo base 0,875rem)
  // (la finestra si apre solo nel browser, dopo un clic: il documento c'e')
  const [autoPt] = useState(() => {
    if (typeof document === "undefined") return 11;
    const px = parseFloat(getComputedStyle(document.documentElement).fontSize) * 0.875;
    return px ? Math.round(px * 0.75) : 11;
  });

  // Chiudendo senza salvare si torna all'aspetto salvato
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

  if (!prefs || !userId) return <p className="text-muted">Caricamento...</p>;

  const set = (patch: Partial<ChatLook>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    applyPrefs(next); // si vede subito nella chat; si conserva con Salva
    setError(null);
  };
  const changed = JSON.stringify(pick(prefs)) !== JSON.stringify(saved ? pick(saved) : null);
  const isDefault = JSON.stringify(pick(prefs)) === JSON.stringify(pick(DEFAULT_PREFS));
  const font = CHAT_FONTS.find((f) => f.value === prefs.chat_font) ?? CHAT_FONTS[0];
  const pt = prefs.chat_font_pt ?? autoPt;
  const textSize = prefs.chat_font_pt ? `${prefs.chat_font_pt}pt` : "0.875rem";
  const setPt = (n: number) =>
    set({ chat_font_pt: Math.min(CHAT_PT_MAX, Math.max(CHAT_PT_MIN, n)) });

  async function save() {
    if (!prefs || !userId) return;
    setBusy(true);
    const ok = await savePrefs(supabase, userId, prefs);
    setBusy(false);
    if (!ok) return setError("Aspetto non salvato: riprova.");
    savedRef.current = prefs; // subito: chiudendo la finestra resta l'aspetto appena salvato
    setSaved(prefs);
    onClose();
  }

  const lbl = "mb-1 text-xs tracking-wider text-muted uppercase";
  return (
    <div className="space-y-5">
      <p className="text-xs text-muted">
        Cambia solo i messaggi della chat, non il resto del sito. Vale per il tuo account, su qualsiasi
        computer o telefono.
      </p>

      {/* Grandezza del testo, in pt */}
      <section>
        <p className={lbl}>Grandezza del testo</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPt(pt - 1)}
            disabled={pt <= CHAT_PT_MIN}
            className="h-8 w-8 rounded border border-border text-lg leading-none disabled:opacity-40"
            aria-label="Testo più piccolo"
          >
            −
          </button>
          <span className="w-14 text-center text-sm">{prefs.chat_font_pt ? `${pt} pt` : "Auto"}</span>
          <button
            type="button"
            onClick={() => setPt(pt + 1)}
            disabled={pt >= CHAT_PT_MAX}
            className="h-8 w-8 rounded border border-border text-lg leading-none disabled:opacity-40"
            aria-label="Testo più grande"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => set({ chat_font_pt: null })}
            className={`rounded border px-2 py-1 text-xs ${prefs.chat_font_pt === null ? "border-accent text-accent" : "border-border text-muted hover:text-foreground"}`}
          >
            Automatico
          </button>
          {CHAT_PT_PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPt(n)}
              className={`rounded border px-2 py-1 text-xs ${prefs.chat_font_pt === n ? "border-accent text-accent" : "border-border text-muted hover:text-foreground"}`}
            >
              {n} pt
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">
          Automatico: si adatta allo schermo (su questo schermo circa {autoPt} pt). Con una misura in pt il testo resta
          sempre di quella grandezza.
        </p>
      </section>

      {/* Carattere */}
      <section>
        <p className={lbl}>Carattere</p>
        <div className="flex flex-wrap gap-2">
          {CHAT_FONTS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => set({ chat_font: f.value as ChatFont })}
              style={{ fontFamily: f.css }}
              className={`rounded border px-3 py-1.5 text-sm ${prefs.chat_font === f.value ? "border-accent text-accent" : "border-border text-muted hover:text-foreground"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </section>

      {/* Colori */}
      <section className="space-y-3">
        <ColorPicker
          label="Nomi dei personaggi"
          colors={NAME_COLORS}
          value={prefs.chat_name_color}
          onChange={(v) => set({ chat_name_color: v })}
        />
        <ColorPicker
          label="Azione"
          colors={ACTION_COLORS}
          value={prefs.action_color}
          onChange={(v) => set({ action_color: v })}
        />
        <ColorPicker
          label="Parlato (il testo tra < > o « »)"
          colors={SPEECH_COLORS}
          value={prefs.speech_color}
          onChange={(v) => set({ speech_color: v })}
        />
        <ColorPicker
          label="Tag (il testo tra [ ], non è parlato)"
          colors={TAG_COLORS}
          value={prefs.chat_tag_color}
          onChange={(v) => set({ chat_tag_color: v })}
        />
      </section>

      {/* Anteprima */}
      <section>
        <p className={lbl}>Anteprima</p>
        <div className="border border-border/60 bg-black/40 px-3 py-2">
          <p
            className="font-serif leading-tight font-semibold tracking-wide uppercase"
            style={{ color: prefs.chat_name_color, fontSize: `calc(${textSize} * 9 / 7)` }}
          >
            Daemon
          </p>
          <p
            className="mt-1 text-justify leading-[1.45]"
            style={{ fontFamily: `${font.css}, sans-serif`, fontSize: textSize, color: prefs.action_color }}
          >
            <span className="italic" style={{ color: prefs.chat_tag_color }}>
              [Sala del trono]
            </span>{" "}
            posa il calice sul tavolo e si volta verso la finestra.{" "}
            <span className="font-semibold" style={{ color: prefs.speech_color }}>
              «Il vento porta notizie da Nord.»
            </span>
          </p>
        </div>
      </section>

      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
        <button type="button" onClick={save} disabled={busy || !changed} className="btn px-4 py-1.5 text-sm">
          {busy ? "Salvataggio..." : "Salva"}
        </button>
        <button type="button" onClick={onClose} className="text-sm text-muted hover:text-foreground">
          Annulla
        </button>
        <button
          type="button"
          onClick={() => set(pick(DEFAULT_PREFS))}
          disabled={isDefault}
          className="ml-auto text-xs text-muted hover:text-foreground disabled:opacity-40"
        >
          Torna ai valori predefiniti
        </button>
      </div>
    </div>
  );
}
