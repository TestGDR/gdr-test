"use client";

import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import {
  Color,
  FontFamily,
  FontSize,
  TextStyle,
} from "@tiptap/extension-text-style";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  addEditorColor,
  listEditorColors,
  removeEditorColor,
  uploadGuideImage,
  type EditorColor,
} from "./actions";

// Editor di testo con due modalita': visuale (TipTap) e HTML. Restituisce sempre HTML.
export default function RichEditor({
  value,
  onChange,
  textClassName = "",
  scroll = false,
  managePalette = false,
}: {
  value: string;
  onChange: (html: string) => void;
  textClassName?: string; // stile di base del testo (es. "forum-text": quello del forum)
  scroll?: boolean; // altezza fissa di 400px: il testo lungo scorre dentro
  managePalette?: boolean; // documentazione: selettore visivo e tavolozza della gestione
}) {
  const [mode, setMode] = useState<"visuale" | "html">("visuale");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      // Allineamento di paragrafi e titoli (salvato come style="text-align: ...")
      TextAlign.configure({
        types: ["heading", "paragraph"],
        alignments: ["left", "center", "right", "justify"],
      }),
      // Colore e dimensione del testo (salvati come style="color: ...; font-size: ...")
      TextStyle,
      Color,
      FontSize,
      FontFamily, // carattere (salvato come style="font-family: ...")
      // Immagini: si ridimensionano trascinando l'angolo, mantenendo le proporzioni
      Image.configure({
        resize: {
          enabled: true,
          minWidth: 60,
          minHeight: 40,
          alwaysPreserveAspectRatio: true,
        },
      }),
    ],
    content: value,
    immediatelyRender: false, // la pagina viene generata anche sul server
    shouldRerenderOnTransaction: true, // la barra mostra lo stato del testo selezionato
    editorProps: {
      // Testo incollato da altre pagine: via grandezza, carattere e colori di
      // origine (restano grassetto, corsivo, allineamento): si adatta al sito
      transformPastedHTML: (html) =>
        html.replace(/style="([^"]*)"/gi, (_, css: string) => {
          const kept = css
            .split(";")
            .filter((rule) => /^\s*text-align\s*:/i.test(rule))
            .join(";");
          return kept ? `style="${kept}"` : "";
        }),
      attributes: {
        class: `guide-content p-4 outline-none ${scroll ? "h-[400px] max-h-[70dvh] overflow-y-auto" : "min-h-64"} ${textClassName}`,
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  function switchTo(next: "visuale" | "html") {
    // Tornando all'editor visuale, carica l'HTML scritto a mano
    if (next === "visuale" && editor)
      editor.commands.setContent(value, { emitUpdate: false });
    setMode(next);
  }

  return (
    <div className="rounded-md border border-border bg-background">
      <div className="flex flex-wrap items-center gap-1 border-b border-border p-1.5">
        {mode === "visuale" && editor && (
          <Toolbar editor={editor} managePalette={managePalette} />
        )}
        <div className="ml-auto flex gap-1 text-xs">
          {(["visuale", "html"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchTo(m)}
              className={`rounded px-2 py-1 tracking-wider uppercase ${
                mode === m
                  ? "bg-blood/40 text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {m === "visuale" ? "Editor" : "HTML"}
            </button>
          ))}
        </div>
      </div>
      {mode === "visuale" ? (
        <EditorContent editor={editor} />
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className={`block w-full bg-transparent p-4 font-mono text-xs leading-relaxed outline-none ${scroll ? "h-[400px] max-h-[70dvh] resize-none overflow-y-auto" : "min-h-64 resize-y"}`}
          aria-label="Codice HTML"
        />
      )}
    </div>
  );
}

function Toolbar({
  editor,
  managePalette,
}: {
  editor: Editor;
  managePalette: boolean;
}) {
  const chain = () => editor.chain().focus();
  const btn = (
    label: ReactNode,
    title: string,
    active: boolean,
    action: () => void,
  ) => (
    <button
      key={title}
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()} // non perdere la selezione nel testo
      onClick={action}
      className={`h-8 min-w-8 rounded px-1.5 text-sm transition ${
        active
          ? "bg-accent/25 text-accent"
          : "text-muted hover:bg-white/5 hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );

  function link() {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt(
      "Indirizzo del link (vuoto per toglierlo)",
      previous ?? "https://",
    );
    if (url === null) return;
    if (url.trim() === "" || url === "https://")
      chain().extendMarkRange("link").unsetLink().run();
    else chain().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  return (
    <>
      {btn(<b>G</b>, "Grassetto", editor.isActive("bold"), () =>
        chain().toggleBold().run(),
      )}
      {btn(<i>C</i>, "Corsivo", editor.isActive("italic"), () =>
        chain().toggleItalic().run(),
      )}
      {btn(<u>S</u>, "Sottolineato", editor.isActive("underline"), () =>
        chain().toggleUnderline().run(),
      )}
      <ColorPicker editor={editor} manage={managePalette} />
      <FontFamilySelect editor={editor} />
      <FontSizeSelect editor={editor} />
      <span className="mx-1 h-5 w-px bg-border" />
      {btn("T1", "Titolo", editor.isActive("heading", { level: 2 }), () =>
        chain().toggleHeading({ level: 2 }).run(),
      )}
      {btn("T2", "Sottotitolo", editor.isActive("heading", { level: 3 }), () =>
        chain().toggleHeading({ level: 3 }).run(),
      )}
      <span className="mx-1 h-5 w-px bg-border" />
      {btn(
        <AlignIcon kind="left" />,
        "Allinea a sinistra",
        editor.isActive({ textAlign: "left" }),
        () => chain().setTextAlign("left").run(),
      )}
      {btn(
        <AlignIcon kind="center" />,
        "Centra",
        editor.isActive({ textAlign: "center" }),
        () => chain().setTextAlign("center").run(),
      )}
      {btn(
        <AlignIcon kind="right" />,
        "Allinea a destra",
        editor.isActive({ textAlign: "right" }),
        () => chain().setTextAlign("right").run(),
      )}
      {btn(
        <AlignIcon kind="justify" />,
        "Giustifica",
        editor.isActive({ textAlign: "justify" }),
        () => chain().setTextAlign("justify").run(),
      )}
      <span className="mx-1 h-5 w-px bg-border" />
      {btn("•", "Elenco puntato", editor.isActive("bulletList"), () =>
        chain().toggleBulletList().run(),
      )}
      {btn("1.", "Elenco numerato", editor.isActive("orderedList"), () =>
        chain().toggleOrderedList().run(),
      )}
      {btn(
        "❝",
        "Riquadro esempio / citazione",
        editor.isActive("blockquote"),
        () => chain().toggleBlockquote().run(),
      )}
      {btn("🔗", "Link", editor.isActive("link"), link)}
      <ImageButton editor={editor} />
      {btn("―", "Linea separatrice", false, () =>
        chain().setHorizontalRule().run(),
      )}
      <span className="mx-1 h-5 w-px bg-border" />
      {btn("↶", "Annulla", false, () => chain().undo().run())}
      {btn("↷", "Ripeti", false, () => chain().redo().run())}
    </>
  );
}

// Icona delle righe di testo allineate
function AlignIcon({
  kind,
}: {
  kind: "left" | "center" | "right" | "justify";
}) {
  const lines: Record<typeof kind, [number, number][]> = {
    left: [
      [3, 21],
      [3, 15],
      [3, 21],
      [3, 13],
    ],
    center: [
      [3, 21],
      [6, 18],
      [3, 21],
      [7, 17],
    ],
    right: [
      [3, 21],
      [9, 21],
      [3, 21],
      [11, 21],
    ],
    justify: [
      [3, 21],
      [3, 21],
      [3, 21],
      [3, 21],
    ],
  };
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
      className="mx-auto"
    >
      {lines[kind].map(([x1, x2], i) => (
        <path key={i} d={`M${x1} ${5 + i * 5}H${x2}`} />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------
// Colore del testo: tavolozza del sito + colore libero
// ---------------------------------------------------------------------
const PALETTE = [
  { label: "Oro antico", value: "#c9a45c" },
  { label: "Rosso sangue", value: "#c2302a" },
  { label: "Oro", value: "#d4a84b" },
  { label: "Avorio", value: "#e4dfdb" },
  { label: "Grigio", value: "#968d89" },
  { label: "Verde", value: "#6aa56a" },
  { label: "Azzurro", value: "#6fa8dc" },
  { label: "Viola", value: "#a77bd1" },
];

// Legge un colore scritto a mano: #fff, #ffffff, #ffffff80, rgb(...) o rgba(...).
// "css" e' la forma con cui viene applicato e salvato
function parseColor(
  input: string,
): { css: string; rgb: [number, number, number] } | null {
  const text = input.trim().toLowerCase();
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text);
  if (hex) {
    const h =
      hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return {
      css: `#${h}`,
      rgb: [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [
        number,
        number,
        number,
      ],
    };
  }
  const fn =
    /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*(\d*\.?\d+%?)\s*)?\)$/.exec(
      text,
    );
  if (!fn) return null;
  const rgb = [fn[1], fn[2], fn[3]].map((n) => Math.min(255, Number(n))) as [
    number,
    number,
    number,
  ];
  const alpha =
    fn[4] === undefined
      ? 1
      : Math.min(
          1,
          fn[4].endsWith("%") ? parseFloat(fn[4]) / 100 : parseFloat(fn[4]),
        );
  if (!(alpha < 1)) return { css: rgbToHex(rgb), rgb };
  return {
    css: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Math.round(alpha * 100) / 100})`,
    rgb,
  };
}

const rgbToHex = (rgb: [number, number, number]) =>
  `#${rgb.map((n) => n.toString(16).padStart(2, "0")).join("")}`;

type Hsv = { h: number; s: number; v: number }; // h 0-360, s e v 0-1

function rgbToHsv([r, g, b]: [number, number, number], fallbackHue = 0): Hsv {
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  let h = fallbackHue; // i grigi non hanno una tinta: resta quella di prima
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max / 255 };
}

function hsvToHex({ h, s, v }: Hsv) {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  return rgbToHex([f(5), f(3), f(1)]);
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function ColorPicker({ editor, manage }: { editor: Editor; manage: boolean }) {
  const [open, setOpen] = useState(false);
  // tavolozza della gestione: letta la prima volta che si apre il menu
  const [saved, setSaved] = useState<EditorColor[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const current =
    (editor.getAttributes("textStyle").color as string | undefined) ?? null;
  // stesso colore scritto in modi diversi (#abc, rgb(...)): si confronta la forma unica
  const same = (a: string | null, b: string) =>
    !!a && (parseColor(a)?.css ?? a) === (parseColor(b)?.css ?? b);

  // Il menu si chiude cliccando altrove
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) =>
      !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const toggle = () => {
    if (!open && manage && saved === null)
      listEditorColors().then((r) => setSaved(r.colors));
    setNote(null);
    setOpen((v) => !v);
  };

  const apply = (color: string | null) => {
    if (color) editor.chain().focus().setColor(color).run();
    else editor.chain().focus().unsetColor().run();
    setOpen(false);
  };

  async function save(color: string) {
    setNote(null);
    if ((saved ?? []).some((c) => same(c.color, color)))
      return setNote("Questo colore è già nella tavolozza.");
    const res = await addEditorColor(color);
    if (res.error || !res.color)
      return setNote(res.error ?? "Salvataggio non riuscito.");
    const added = res.color;
    setSaved((list) => [...(list ?? []), added]);
    setNote("Colore salvato nella tavolozza.");
  }

  async function remove(id: string) {
    setNote(null);
    const res = await removeEditorColor(id);
    if (res.error) return setNote(res.error);
    setSaved((list) => (list ?? []).filter((c) => c.id !== id));
  }

  return (
    <span ref={ref} className="relative">
      <button
        type="button"
        title="Colore del testo"
        aria-label="Colore del testo"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
        className="flex h-8 min-w-8 flex-col items-center justify-center rounded px-1.5 text-sm text-muted hover:bg-white/5 hover:text-foreground"
      >
        <span className="leading-none font-bold">A</span>
        <span
          className="mt-0.5 h-1 w-4 rounded-sm"
          style={{ background: current ?? "var(--foreground)" }}
        />
      </button>
      {open && (
        <span
          className={`absolute top-9 left-0 z-50 rounded-md border border-border bg-panel p-2 shadow-xl shadow-black ${manage ? "w-60" : "w-44"}`}
        >
          <span
            className={`grid gap-1.5 ${manage ? "grid-cols-6" : "grid-cols-4"}`}
          >
            {PALETTE.map((c) => (
              <button
                key={c.value}
                type="button"
                title={c.label}
                aria-label={c.label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => apply(c.value)}
                className={`h-7 w-7 rounded border-2 ${same(current, c.value) ? "border-white" : "border-transparent hover:border-white/50"}`}
                style={{ background: c.value }}
              />
            ))}
          </span>
          {manage && (
            <span className="mt-2 block border-t border-border pt-2">
              <span className="mb-1.5 block text-[0.625rem] tracking-wider text-muted uppercase">
                Colori della gestione
              </span>
              {saved === null ? (
                <span className="block text-xs text-muted">Caricamento...</span>
              ) : saved.length === 0 ? (
                <span className="block text-xs text-muted">
                  Ancora nessun colore salvato: scegline uno qui sotto e premi
                  «Salva».
                </span>
              ) : (
                <span className="grid grid-cols-6 gap-1.5">
                  {saved.map((c) => (
                    <span key={c.id} className="group relative h-7 w-7">
                      <button
                        type="button"
                        title={c.color}
                        aria-label={`Colore salvato ${c.color}`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => apply(c.color)}
                        className={`h-7 w-7 rounded border-2 ${same(current, c.color) ? "border-white" : "border-black/40 hover:border-white/50"}`}
                        style={{ background: c.color }}
                      />
                      <button
                        type="button"
                        title={`Togli ${c.color} dalla tavolozza`}
                        aria-label={`Togli ${c.color} dalla tavolozza`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => remove(c.id)}
                        className="absolute -top-1.5 -right-1.5 hidden h-4 w-4 items-center justify-center rounded-full border border-border bg-background text-[0.625rem] leading-none text-muted group-hover:flex hover:text-red-400"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </span>
              )}
              <VisualPicker
                initial={current}
                onApply={(color) => apply(color)}
                onSave={save}
              />
              {note && (
                <span className="mt-1.5 block text-xs text-muted">{note}</span>
              )}
            </span>
          )}
          <span className="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
            {manage ? (
              <span />
            ) : (
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="color"
                  value={current ?? "#e4dfdb"}
                  onChange={(e) =>
                    editor.chain().focus().setColor(e.target.value).run()
                  }
                  className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent"
                />
                Altro
              </label>
            )}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => apply(null)}
              className="hover:text-accent"
            >
              Togli colore
            </button>
          </span>
        </span>
      )}
    </span>
  );
}

// Selettore visivo: riquadro delle sfumature, barra delle tinte, anteprima e
// codice scritto a mano (HEX, oppure rgb/rgba)
function VisualPicker({
  initial,
  onApply,
  onSave,
}: {
  initial: string | null;
  onApply: (color: string) => void;
  onSave: (color: string) => void;
}) {
  const [hsv, setHsv] = useState<Hsv>(() =>
    rgbToHsv((parseColor(initial ?? "") ?? parseColor("#c9a45c")!).rgb),
  );
  const [text, setText] = useState(
    () => (parseColor(initial ?? "") ?? parseColor("#c9a45c")!).css,
  );
  const parsed = parseColor(text);

  // scelta con il mouse: aggiorna anche il codice scritto
  const choose = (next: Hsv) => {
    setHsv(next);
    setText(hsvToHex(next));
  };
  // codice scritto a mano: se e' valido sposta anche i cursori
  const type = (value: string) => {
    setText(value);
    const color = parseColor(value);
    if (color) setHsv((old) => rgbToHsv(color.rgb, old.h));
  };

  // trascinamento dentro un riquadro: x e y da 0 a 1
  const drag = (move: (x: number, y: number) => void) => {
    const at = (e: React.PointerEvent<HTMLDivElement>) => {
      const box = e.currentTarget.getBoundingClientRect();
      move(
        clamp01((e.clientX - box.left) / box.width),
        clamp01((e.clientY - box.top) / box.height),
      );
    };
    return {
      onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault(); // non perdere la selezione nel testo
        e.currentTarget.setPointerCapture(e.pointerId);
        at(e);
      },
      onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) at(e);
      },
    };
  };

  return (
    <div className="mt-2 space-y-2">
      <div
        {...drag((x, y) => choose({ h: hsv.h, s: x, v: 1 - y }))}
        role="presentation"
        title="Scegli la sfumatura"
        data-picker="sfumatura"
        className="relative h-28 w-full cursor-crosshair touch-none rounded border border-border"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))`,
        }}
      >
        <span
          className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_#000]"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
        />
      </div>
      <div
        {...drag((x) => choose({ ...hsv, h: Math.round(x * 359) }))}
        role="presentation"
        title="Scegli la tinta"
        data-picker="tinta"
        className="relative h-3 w-full cursor-pointer touch-none rounded border border-border"
        style={{
          background:
            "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
        }}
      >
        <span
          className="pointer-events-none absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-black bg-white"
          style={{ left: `${(hsv.h / 359) * 100}%` }}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <span
          title="Anteprima"
          className="h-7 w-7 shrink-0 rounded border border-border"
          style={{ background: parsed?.css ?? "transparent" }}
        />
        <input
          value={text}
          onChange={(e) => type(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (parsed) onApply(parsed.css);
            }
          }}
          spellCheck={false}
          maxLength={30}
          placeholder="#FFFFFF"
          aria-label="Codice del colore (HEX, rgb o rgba)"
          title="Codice HEX (es. #FFFFFF), oppure rgb(...) o rgba(...)"
          className="input min-w-0 flex-1 py-1 font-mono text-xs"
        />
      </div>
      {!parsed && (
        <p className="text-xs text-red-400">
          Codice non valido: es. #FFFFFF o rgb(255, 255, 255).
        </p>
      )}
      <div className="flex gap-1.5">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => parsed && onApply(parsed.css)}
          disabled={!parsed}
          className="btn flex-1 py-1 text-xs"
        >
          Applica
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => parsed && onSave(parsed.css)}
          disabled={!parsed}
          title="Salva questo colore nella tavolozza della gestione"
          className="btn-ghost flex-1 py-1 text-xs"
        >
          Salva
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Dimensione del testo
// ---------------------------------------------------------------------
const SIZES = [
  { label: "Piccolo", value: "13px" },
  { label: "Normale", value: "" },
  { label: "Medio", value: "18px" },
  { label: "Grande", value: "22px" },
  { label: "Molto grande", value: "28px" },
  { label: "Enorme", value: "36px" },
];

// Caratteri: quelli del sito e alcuni classici che hanno tutti i computer
const FONTS = [
  { label: "Carattere", value: "" },
  { label: "Cinzel (titoli)", value: "var(--font-title), serif" },
  { label: "Open Sans (testo)", value: "var(--font-body), sans-serif" },
  { label: "Lora", value: "var(--font-lora), serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Garamond", value: "Garamond, 'Times New Roman', serif" },
  { label: "Times", value: "'Times New Roman', serif" },
  { label: "Verdana", value: "Verdana, sans-serif" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Corsivo", value: "'Brush Script MT', 'Segoe Script', cursive" },
  { label: "Macchina da scrivere", value: "'Courier New', monospace" },
];

function FontFamilySelect({ editor }: { editor: Editor }) {
  const current =
    (editor.getAttributes("textStyle").fontFamily as string | undefined) ?? "";
  return (
    <select
      value={FONTS.some((f) => f.value === current) ? current : ""}
      onChange={(e) => {
        const font = e.target.value;
        if (font) editor.chain().focus().setFontFamily(font).run();
        else editor.chain().focus().unsetFontFamily().run();
      }}
      title="Carattere del testo"
      aria-label="Carattere del testo"
      className="h-8 max-w-32 rounded border border-border bg-background px-1.5 text-xs text-muted hover:text-foreground"
    >
      {FONTS.map((f) => (
        <option
          key={f.label}
          value={f.value}
          style={f.value ? { fontFamily: f.value } : undefined}
        >
          {f.label}
        </option>
      ))}
    </select>
  );
}

function FontSizeSelect({ editor }: { editor: Editor }) {
  const current =
    (editor.getAttributes("textStyle").fontSize as string | undefined) ?? "";
  return (
    <select
      value={SIZES.some((s) => s.value === current) ? current : ""}
      onChange={(e) => {
        const size = e.target.value;
        if (size) editor.chain().focus().setFontSize(size).run();
        else editor.chain().focus().unsetFontSize().run();
      }}
      title="Dimensione del testo"
      aria-label="Dimensione del testo"
      className="h-8 rounded border border-border bg-background px-1.5 text-xs text-muted hover:text-foreground"
    >
      {SIZES.map((s) => (
        <option key={s.label} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------
// Immagine: caricata dal computer oppure da un indirizzo web
// ---------------------------------------------------------------------
function ImageButton({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  // Il riquadro si chiude cliccando altrove
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) =>
      !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  // Non e' un <form>: l'editor puo' stare dentro un altro modulo (es. dati della casata)
  async function insert() {
    setError(null);
    let src = url.trim();
    if (file) {
      setBusy(true);
      const form = new FormData();
      form.set("image", file);
      const res = await uploadGuideImage(form);
      setBusy(false);
      if (res.error || !res.url)
        return setError(res.error ?? "Caricamento non riuscito.");
      src = res.url;
    }
    if (!src.toLowerCase().startsWith("https://"))
      return setError(
        "Carica un file oppure incolla un indirizzo che inizia con https://",
      );
    editor
      .chain()
      .focus()
      .setImage({ src, alt: alt.trim() || undefined })
      .run();
    setOpen(false);
    setUrl("");
    setAlt("");
    setFile(null);
  }

  return (
    <span ref={ref} className="relative">
      <button
        type="button"
        title="Inserisci immagine"
        aria-label="Inserisci immagine"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        className="h-8 min-w-8 rounded px-1.5 text-sm text-muted transition hover:bg-white/5 hover:text-foreground"
      >
        🖼
      </button>
      {open && (
        <div className="absolute top-9 left-0 z-50 w-72 space-y-2 rounded-md border border-border bg-panel p-3 text-xs shadow-xl shadow-black">
          <label className="block">
            <span className="mb-1 block tracking-wider text-muted uppercase">
              Dal computer (max 2 MB)
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-muted file:mr-2 file:rounded file:border file:border-border file:bg-background file:px-2 file:py-1 file:text-foreground"
            />
          </label>
          <label className="block">
            <span className="mb-1 block tracking-wider text-muted uppercase">
              Oppure indirizzo web
            </span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  insert();
                }
              }}
              disabled={!!file}
              placeholder="https://..."
              className="input py-1 text-xs"
            />
          </label>
          <label className="block">
            <span className="mb-1 block tracking-wider text-muted uppercase">
              Descrizione (facoltativa)
            </span>
            <input
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  insert();
                }
              }}
              maxLength={150}
              placeholder="Es. Mappa di Essos"
              className="input py-1 text-xs"
            />
          </label>
          {error && <p className="text-red-400">{error}</p>}
          <button
            type="button"
            onClick={insert}
            className="btn w-full py-1.5 text-xs"
            disabled={busy || (!file && !url.trim())}
          >
            {busy ? "Caricamento..." : "Inserisci"}
          </button>
          <p className="text-[0.625rem] leading-snug text-muted">
            Dopo l&apos;inserimento trascina l&apos;angolo dell&apos;immagine
            per ridimensionarla.
          </p>
        </div>
      )}
    </span>
  );
}
