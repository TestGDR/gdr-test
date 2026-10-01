"use client";

import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useState, type ReactNode } from "react";

// Editor di testo con due modalita': visuale (TipTap) e HTML. Restituisce sempre HTML.
export default function RichEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const [mode, setMode] = useState<"visuale" | "html">("visuale");

  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: false } })],
    content: value,
    immediatelyRender: false, // la pagina viene generata anche sul server
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
      <span className="mx-1 h-5 w-px bg-border" />
      {btn("T1", "Titolo", editor.isActive("heading", { level: 2 }), () => chain().toggleHeading({ level: 2 }).run())}
      {btn("T2", "Sottotitolo", editor.isActive("heading", { level: 3 }), () => chain().toggleHeading({ level: 3 }).run())}
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
