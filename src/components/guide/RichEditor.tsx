"use client";

import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { Color, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { useEffect, useRef, useState, type ReactNode } from "react";

// Editor di testo con due modalita': visuale (TipTap) e HTML. Restituisce sempre HTML.
export default function RichEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const [mode, setMode] = useState<"visuale" | "html">("visuale");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      // Allineamento di paragrafi e titoli (salvato come style="text-align: ...")
      TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right", "justify"] }),
      // Colore e dimensione del testo (salvati come style="color: ...; font-size: ...")
      TextStyle,
      Color,
      FontSize,
    ],
    content: value,
    immediatelyRender: false, // la pagina viene generata anche sul server
    shouldRerenderOnTransaction: true, // la barra mostra lo stato del testo selezionato
    editorProps: { attributes: { class: "guide-content min-h-64 p-4 outline-none" } },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  function switchTo(next: "visuale" | "html") {
    // Tornando all'editor visuale, carica l'HTML scritto a mano
    if (next === "visuale" && editor) editor.commands.setContent(value, { emitUpdate: false });
    setMode(next);
  }

  return (
    <div className="rounded-md border border-border bg-background">
      <div className="flex flex-wrap items-center gap-1 border-b border-border p-1.5">
        {mode === "visuale" && editor && <Toolbar editor={editor} />}
        <div className="ml-auto flex gap-1 text-xs">
          {(["visuale", "html"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchTo(m)}
              className={`rounded px-2 py-1 tracking-wider uppercase ${
                mode === m ? "bg-blood/40 text-foreground" : "text-muted hover:text-foreground"
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
          className="block min-h-64 w-full resize-y bg-transparent p-4 font-mono text-xs leading-relaxed outline-none"
          aria-label="Codice HTML"
        />
      )}
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const chain = () => editor.chain().focus();
  const btn = (label: ReactNode, title: string, active: boolean, action: () => void) => (
    <button
      key={title}
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()} // non perdere la selezione nel testo
      onClick={action}
      className={`h-8 min-w-8 rounded px-1.5 text-sm transition ${
        active ? "bg-accent/25 text-accent" : "text-muted hover:bg-white/5 hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );

  function link() {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Indirizzo del link (vuoto per toglierlo)", previous ?? "https://");
    if (url === null) return;
    if (url.trim() === "" || url === "https://") chain().extendMarkRange("link").unsetLink().run();
    else chain().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  return (
    <>
      {btn(<b>G</b>, "Grassetto", editor.isActive("bold"), () => chain().toggleBold().run())}
      {btn(<i>C</i>, "Corsivo", editor.isActive("italic"), () => chain().toggleItalic().run())}
      {btn(<u>S</u>, "Sottolineato", editor.isActive("underline"), () => chain().toggleUnderline().run())}
      <ColorPicker editor={editor} />
      <FontSizeSelect editor={editor} />
      <span className="mx-1 h-5 w-px bg-border" />
      {btn("T1", "Titolo", editor.isActive("heading", { level: 2 }), () => chain().toggleHeading({ level: 2 }).run())}
      {btn("T2", "Sottotitolo", editor.isActive("heading", { level: 3 }), () => chain().toggleHeading({ level: 3 }).run())}
      <span className="mx-1 h-5 w-px bg-border" />
      {btn(<AlignIcon kind="left" />, "Allinea a sinistra", editor.isActive({ textAlign: "left" }), () => chain().setTextAlign("left").run())}
      {btn(<AlignIcon kind="center" />, "Centra", editor.isActive({ textAlign: "center" }), () => chain().setTextAlign("center").run())}
      {btn(<AlignIcon kind="right" />, "Allinea a destra", editor.isActive({ textAlign: "right" }), () => chain().setTextAlign("right").run())}
      {btn(<AlignIcon kind="justify" />, "Giustifica", editor.isActive({ textAlign: "justify" }), () => chain().setTextAlign("justify").run())}
      <span className="mx-1 h-5 w-px bg-border" />
      {btn("•", "Elenco puntato", editor.isActive("bulletList"), () => chain().toggleBulletList().run())}
      {btn("1.", "Elenco numerato", editor.isActive("orderedList"), () => chain().toggleOrderedList().run())}
      {btn("❝", "Riquadro esempio / citazione", editor.isActive("blockquote"), () => chain().toggleBlockquote().run())}
      {btn("🔗", "Link", editor.isActive("link"), link)}
      {btn("―", "Linea separatrice", false, () => chain().setHorizontalRule().run())}
      <span className="mx-1 h-5 w-px bg-border" />
      {btn("↶", "Annulla", false, () => chain().undo().run())}
      {btn("↷", "Ripeti", false, () => chain().redo().run())}
    </>
  );
}

// Icona delle righe di testo allineate
function AlignIcon({ kind }: { kind: "left" | "center" | "right" | "justify" }) {
  const lines: Record<typeof kind, [number, number][]> = {
    left: [[3, 21], [3, 15], [3, 21], [3, 13]],
    center: [[3, 21], [6, 18], [3, 21], [7, 17]],
    right: [[3, 21], [9, 21], [3, 21], [11, 21]],
    justify: [[3, 21], [3, 21], [3, 21], [3, 21]],
  };
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden className="mx-auto">
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
  { label: "Arancio brace", value: "#e2622d" },
  { label: "Rosso sangue", value: "#c2302a" },
  { label: "Oro", value: "#d4a84b" },
  { label: "Avorio", value: "#e4dfdb" },
  { label: "Grigio", value: "#968d89" },
  { label: "Verde", value: "#6aa56a" },
  { label: "Azzurro", value: "#6fa8dc" },
  { label: "Viola", value: "#a77bd1" },
];

function ColorPicker({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const current = (editor.getAttributes("textStyle").color as string | undefined) ?? null;

  // Il menu si chiude cliccando altrove
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const apply = (color: string | null) => {
    if (color) editor.chain().focus().setColor(color).run();
    else editor.chain().focus().unsetColor().run();
    setOpen(false);
  };

  return (
    <span ref={ref} className="relative">
      <button
        type="button"
        title="Colore del testo"
        aria-label="Colore del testo"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 min-w-8 flex-col items-center justify-center rounded px-1.5 text-sm text-muted hover:bg-white/5 hover:text-foreground"
      >
        <span className="leading-none font-bold">A</span>
        <span className="mt-0.5 h-1 w-4 rounded-sm" style={{ background: current ?? "var(--foreground)" }} />
      </button>
      {open && (
        <span className="absolute top-9 left-0 z-50 w-44 rounded-md border border-border bg-panel p-2 shadow-xl shadow-black">
          <span className="grid grid-cols-4 gap-1.5">
            {PALETTE.map((c) => (
              <button
                key={c.value}
                type="button"
                title={c.label}
                aria-label={c.label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => apply(c.value)}
                className={`h-7 w-7 rounded border-2 ${current === c.value ? "border-white" : "border-transparent hover:border-white/50"}`}
                style={{ background: c.value }}
              />
            ))}
          </span>
          <span className="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="color"
                value={current ?? "#e4dfdb"}
                onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
                className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent"
              />
              Altro
            </label>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => apply(null)} className="hover:text-accent">
              Togli colore
            </button>
          </span>
        </span>
      )}
    </span>
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

function FontSizeSelect({ editor }: { editor: Editor }) {
  const current = (editor.getAttributes("textStyle").fontSize as string | undefined) ?? "";
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
