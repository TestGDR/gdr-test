"use client";

import DOMPurify from "dompurify";
import { marked } from "marked";
import { useCallback, useEffect, useMemo, useState, type DragEvent, type FormEvent, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ModalButton from "@/components/ui/ModalButton";
import { createClient } from "@/lib/supabase/client";
import {
  createPage,
  createSection,
  deletePage,
  deleteSection,
  renameSection,
  saveOrder,
  savePage,
  type GuideResult,
} from "./actions";
import RichEditor from "./RichEditor";

type Book = "manuale" | "ambientazione";
type Section = { id: string; title: string; sort_order: number };
type Page = { id: string; section_id: string; title: string; sort_order: number };
type Body = { body: string; format: "markdown" | "html" };
type Drag = { type: "section" | "page"; id: string } | null;

const PAGE_COLUMNS = "id, section_id, title, sort_order";

// Pulsante che apre Manuale di Gioco o Ambientazione in una modale.
// "trigger" mostra un'icona al posto del testo; "canEdit" abilita la modifica (staff).
export default function GuideButton({
  book,
  label,
  trigger,
  className = "hover:text-accent",
  canEdit = false,
}: {
  book: Book;
  label: string;
  trigger?: ReactNode;
  className?: string;
  canEdit?: boolean;
}) {
  // Il contenuto si carica solo alla prima apertura, non a ogni pagina visitata
  const [opened, setOpened] = useState(false);

  return (
    <ModalButton label={trigger ?? label} title={label} size="xl" className={className} onOpen={() => setOpened(true)}>
      {() => (opened ? <GuideBrowser book={book} label={label} canEdit={canEdit} /> : null)}
    </ModalButton>
  );
}

function GuideBrowser({ book, label, canEdit }: { book: Book; label: string; canEdit: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [sections, setSections] = useState<Section[] | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bodies, setBodies] = useState<Record<string, Body>>({});
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Page[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [editing, setEditing] = useState(false);
  const [drag, setDrag] = useState<Drag>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Indice: macrosezioni e titoli delle sezioni
  const fetchIndex = useCallback(
    () =>
      Promise.all([
        supabase.from("guide_sections").select("id, title, sort_order").eq("book", book).order("sort_order"),
        supabase.from("guide_pages").select(PAGE_COLUMNS).eq("book", book).order("sort_order"),
      ]),
    [supabase, book],
  );

  const reload = useCallback(
    () =>
      fetchIndex().then(([s, p]) => {
        if (s.error || p.error) return setLoadError(true);
        setSections((s.data ?? []) as Section[]);
        setPages((p.data ?? []) as Page[]);
      }),
    [fetchIndex],
  );

  useEffect(() => {
    fetchIndex().then(([s, p]) => {
      if (s.error || p.error) return setLoadError(true);
      const secs = (s.data ?? []) as Section[];
      const pgs = (p.data ?? []) as Page[];
      setSections(secs);
      setPages(pgs);
      // All'apertura: prima macrosezione aperta e sua prima sezione mostrata
      const first = secs[0];
      if (first) {
        setOpen(new Set([first.id]));
        setSelectedId(pgs.find((x) => x.section_id === first.id)?.id ?? null);
      }
    });
  }, [fetchIndex]);

  // Testo della sezione scelta (una volta sola, poi resta in memoria)
  useEffect(() => {
    if (!selectedId || bodies[selectedId] !== undefined) return;
    supabase
      .from("guide_pages")
      .select("body, format")
      .eq("id", selectedId)
      .single()
      .then(({ data }) =>
        setBodies((prev) => ({ ...prev, [selectedId]: { body: data?.body ?? "", format: data?.format ?? "markdown" } })),
      );
  }, [supabase, selectedId, bodies]);

  const pagesOf = (sectionId: string) => pages.filter((p) => p.section_id === sectionId);
  const selected = pages.find((p) => p.id === selectedId) ?? null;

  function toggle(sectionId: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }

  function openPage(page: Page) {
    setOpen((prev) => new Set(prev).add(page.section_id));
    setSelectedId(page.id);
    setResults(null);
  }

  async function act(action: () => Promise<GuideResult>, after?: (res: GuideResult) => void) {
    setError(null);
    const res = await action();
    if (res.error) return setError(res.error);
    await reload();
    after?.(res);
  }

  async function search(e: FormEvent) {
    e.preventDefault();
    // Caratteri con significato speciale nei filtri di Supabase
    const q = query.replace(/[,()*%_\\:"]/g, " ").trim();
    if (!q) return setResults(null);
    setSearching(true);
    const { data } = await supabase
      .from("guide_pages")
      .select(PAGE_COLUMNS)
      .eq("book", book)
      .or(`title.ilike.%${q}%,body.ilike.%${q}%`)
      .order("sort_order");
    setSearching(false);
    setResults((data ?? []) as Page[]);
  }

  // -------------------------------------------------------------------
  // Trascinamento (solo in modifica): riordina e salva l'elenco completo
  // -------------------------------------------------------------------
  function persist(nextSections: Section[], nextPages: Page[]) {
    setSections(nextSections);
    setPages(nextPages);
    const layout = nextSections.map((s) => ({
      sectionId: s.id,
      pageIds: nextPages.filter((p) => p.section_id === s.id).map((p) => p.id),
    }));
    act(() => saveOrder(book, layout));
  }

  function dropOnSection(targetSectionId: string) {
    if (!drag || !sections) return;
    if (drag.type === "section" && drag.id !== targetSectionId) {
      const moving = sections.find((s) => s.id === drag.id)!;
      const rest = sections.filter((s) => s.id !== drag.id);
      const at = rest.findIndex((s) => s.id === targetSectionId);
      persist([...rest.slice(0, at), moving, ...rest.slice(at)], pages);
    }
    if (drag.type === "page") {
      // Sezione rilasciata sul titolo di una macrosezione: va in fondo a quella
      const moving = { ...pages.find((p) => p.id === drag.id)!, section_id: targetSectionId };
      const rest = pages.filter((p) => p.id !== drag.id);
      persist(sections, [...rest, moving]);
      setOpen((prev) => new Set(prev).add(targetSectionId));
    }
  }

  function dropOnPage(targetPageId: string) {
    if (!drag || drag.type !== "page" || drag.id === targetPageId || !sections) return;
    const target = pages.find((p) => p.id === targetPageId)!;
    const moving = { ...pages.find((p) => p.id === drag.id)!, section_id: target.section_id };
    const rest = pages.filter((p) => p.id !== drag.id);
    const at = rest.findIndex((p) => p.id === targetPageId);
    persist(sections, [...rest.slice(0, at), moving, ...rest.slice(at)]);
  }

  const dragProps = (type: "section" | "page", id: string) =>
    editing
      ? {
          draggable: true,
          onDragStart: (e: DragEvent) => {
            e.stopPropagation();
            e.dataTransfer.effectAllowed = "move";
            setDrag({ type, id });
          },
          onDragEnd: () => {
            setDrag(null);
            setDropTarget(null);
          },
        }
      : {};

  const dropProps = (key: string, onDrop: () => void, accepts: (d: NonNullable<Drag>) => boolean) =>
    editing
      ? {
          onDragOver: (e: DragEvent) => {
            if (!drag || !accepts(drag)) return;
            e.preventDefault();
            e.stopPropagation();
            setDropTarget(key);
          },
          onDragLeave: () => setDropTarget((t) => (t === key ? null : t)),
          onDrop: (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            onDrop();
            setDrag(null);
            setDropTarget(null);
          },
        }
      : {};

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Colonna sinistra: macrosezioni (si aprono/chiudono) e sezioni */}
      <aside className="max-h-56 shrink-0 space-y-2 overflow-y-auto border-b border-border p-3 md:max-h-none md:w-80 md:border-r md:border-b-0">
        {loadError && <p className="p-2 text-sm text-red-400">Impossibile caricare i contenuti.</p>}
        {sections === null && !loadError && <p className="p-2 text-sm text-muted">Caricamento...</p>}
        {sections?.length === 0 && <p className="p-2 text-sm text-muted">Nessun contenuto.</p>}

        {sections?.map((section) => {
          const isOpen = open.has(section.id);
          const items = pagesOf(section.id);
          return (
            <div
              key={section.id}
              className={`overflow-hidden rounded-md border bg-black/30 transition ${
                dropTarget === `s:${section.id}` ? "border-accent shadow-[0_0_0_1px_var(--accent)]" : "border-border"
              } ${drag?.id === section.id ? "opacity-40" : ""}`}
              {...dragProps("section", section.id)}
              {...dropProps(`s:${section.id}`, () => dropOnSection(section.id), () => true)}
            >
              <div className="flex items-center">
                {editing && <DragHandle />}
                <button
                  type="button"
                  onClick={() => toggle(section.id)}
                  className="flex min-w-0 flex-1 items-center justify-between gap-2 px-3 py-3 text-left text-xs font-semibold tracking-wider uppercase hover:text-accent"
                  aria-expanded={isOpen}
                >
                  <span className="truncate">{section.title}</span>
                  <Chevron up={isOpen} />
                </button>
                {editing && (
                  <span className="flex shrink-0 gap-0.5 pr-1.5">
                    <IconBtn
                      title="Rinomina macrosezione"
                      onClick={() => {
                        const title = window.prompt("Nuovo nome della macrosezione", section.title);
                        if (title !== null) act(() => renameSection(section.id, title));
                      }}
                    >
                      ✎
                    </IconBtn>
                    <IconBtn
                      title="Elimina macrosezione"
                      danger
                      onClick={() =>
                        window.confirm(`Eliminare la macrosezione "${section.title}" e tutte le sue ${items.length} sezioni?`) &&
                        act(() => deleteSection(section.id), () => items.some((p) => p.id === selectedId) && setSelectedId(null))
                      }
                    >
                      🗑
                    </IconBtn>
                  </span>
                )}
              </div>
              {isOpen && (
                <ul className="border-t border-border py-1">
                  {items.map((p) => (
                    <li
                      key={p.id}
                      {...dragProps("page", p.id)}
                      {...dropProps(`p:${p.id}`, () => dropOnPage(p.id), (d) => d.type === "page")}
                      className={`flex items-center border-t-2 ${
                        dropTarget === `p:${p.id}` ? "border-accent" : "border-transparent"
                      } ${drag?.id === p.id ? "opacity-40" : ""}`}
                    >
                      {editing && <DragHandle />}
                      <button
                        type="button"
                        onClick={() => openPage(p)}
                        className={`min-w-0 flex-1 border-l-2 px-4 py-2 text-left text-[11px] tracking-wide uppercase transition ${
                          p.id === selectedId
                            ? "border-accent bg-blood/25 font-bold text-foreground"
                            : "border-transparent text-muted hover:text-foreground"
                        }`}
                      >
                        {p.title}
                      </button>
                    </li>
                  ))}
                  {items.length === 0 && <li className="px-4 py-2 text-[11px] text-muted">Nessuna sezione.</li>}
                  {editing && (
                    <li className="px-2 pt-1 pb-1.5">
                      <InlineAdd
                        placeholder="Nuova sezione"
                        onAdd={(title) => act(() => createPage(section.id, title), (res) => res.id && setSelectedId(res.id))}
                      />
                    </li>
                  )}
                </ul>
              )}
            </div>
          );
        })}

        {editing && sections && (
          <div className="rounded-md border border-dashed border-accent/50 p-2">
            <InlineAdd
              placeholder="Nuova macrosezione"
              onAdd={(title) => act(() => createSection(book, title), (res) => res.id && setOpen((prev) => new Set(prev).add(res.id!)))}
            />
            <p className="mt-1.5 text-[10px] leading-snug text-muted">
              Trascina ⠿ per riordinare. Una sezione rilasciata sul titolo di una macrosezione va in fondo a quella.
            </p>
          </div>
        )}
      </aside>

      {/* Parte destra: ricerca + documento (o editor) */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col p-4">
        <div className="mb-4 flex shrink-0 flex-wrap gap-2">
          {!editing && (
            <form onSubmit={search} className="flex min-w-0 flex-1 gap-2">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Cerca in ${label}`} className="input min-w-0 flex-1" />
              <button className="btn text-xs tracking-widest uppercase" disabled={searching}>
                Cerca
              </button>
            </form>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setEditing((v) => !v);
                setResults(null);
                setError(null);
              }}
              className={`${editing ? "btn" : "btn-ghost"} ml-auto text-xs tracking-widest uppercase`}
            >
              {editing ? "✓ Fine modifica" : "✎ Modifica"}
            </button>
          )}
        </div>
        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

        <div className="min-h-0 flex-1 overflow-y-auto pr-2">
          {editing ? (
            selected ? (
              <PageEditor
                key={selected.id}
                page={selected}
                body={bodies[selected.id]}
                onSaved={(title, html) => {
                  setPages((prev) => prev.map((p) => (p.id === selected.id ? { ...p, title } : p)));
                  setBodies((prev) => ({ ...prev, [selected.id]: { body: html, format: "html" } }));
                }}
                onDelete={() =>
                  window.confirm(`Eliminare la sezione "${selected.title}"?`) &&
                  act(() => deletePage(selected.id), () => setSelectedId(null))
                }
              />
            ) : (
              <p className="py-10 text-center text-muted">
                Scegli una sezione da modificare, oppure creane una con &quot;+&quot; dentro una macrosezione.
              </p>
            )
          ) : results ? (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-serif text-xl text-accent">
                  {results.length} risultat{results.length === 1 ? "o" : "i"}
                </h3>
                <button type="button" onClick={() => setResults(null)} className="text-sm text-muted hover:text-accent">
                  Chiudi ricerca
                </button>
              </div>
              <ul className="space-y-2">
                {results.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => openPage(p)}
                      className="w-full rounded-md border border-border px-4 py-2 text-left hover:border-accent"
                    >
                      <span className="block text-xs text-muted uppercase">
                        {sections?.find((s) => s.id === p.section_id)?.title}
                      </span>
                      {p.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : selected ? (
            <article className="guide-content">
              <h2>{selected.title}</h2>
              {bodies[selected.id] === undefined ? (
                <p className="text-muted">Caricamento...</p>
              ) : (
                <GuideText body={bodies[selected.id]} />
              )}
            </article>
          ) : null}
        </div>
      </section>
    </div>
  );
}

// Testo di una sezione: HTML ripulito da script e codice pericoloso, oppure Markdown (pagine vecchie)
function GuideText({ body }: { body: Body }) {
  if (body.format === "markdown") return <ReactMarkdown remarkPlugins={[remarkGfm]}>{body.body}</ReactMarkdown>;
  return <div dangerouslySetInnerHTML={{ __html: sanitize(body.body) }} />;
}

function sanitize(html: string) {
  return typeof window === "undefined" ? "" : DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

function PageEditor({
  page,
  body,
  onSaved,
  onDelete,
}: {
  page: Page;
  body: Body | undefined;
  onSaved: (title: string, html: string) => void;
  onDelete: () => void;
}) {
  if (body === undefined) return <p className="text-muted">Caricamento...</p>;
  return <PageEditorForm page={page} body={body} onSaved={onSaved} onDelete={onDelete} />;
}

function PageEditorForm({
  page,
  body,
  onSaved,
  onDelete,
}: {
  page: Page;
  body: Body;
  onSaved: (title: string, html: string) => void;
  onDelete: () => void;
}) {
  // Le pagine vecchie in Markdown vengono convertite in HTML per l'editor
  const [html, setHtml] = useState(() =>
    body.format === "markdown" ? (marked.parse(body.body, { async: false }) as string) : body.body,
  );
  const [title, setTitle] = useState(page.title);
  const [status, setStatus] = useState<{ error?: string; ok?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setStatus(null);
    const clean = sanitize(html);
    const res = await savePage(page.id, title, clean);
    setSaving(false);
    if (res.error) return setStatus({ error: res.error });
    setStatus({ ok: "Sezione salvata." });
    onSaved(title.trim(), clean);
  }

  return (
    <div className="space-y-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={120}
        placeholder="Titolo della sezione"
        className="input font-serif text-xl"
        aria-label="Titolo della sezione"
      />
      <RichEditor value={html} onChange={setHtml} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className="btn">
          {saving ? "Salvataggio..." : "Salva sezione"}
        </button>
        <button type="button" onClick={onDelete} className="btn-ghost border-red-900 text-red-400 hover:border-red-500">
          Elimina sezione
        </button>
        {status && <p className={`text-sm ${status.error ? "text-red-400" : "text-green-400"}`}>{status.error ?? status.ok}</p>}
      </div>
    </div>
  );
}

function InlineAdd({ placeholder, onAdd }: { placeholder: string; onAdd: (title: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        onAdd(value);
        setValue("");
      }}
      className="flex gap-1.5"
    >
      <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} maxLength={120} className="input min-w-0 flex-1 py-1 text-xs" />
      <button className="btn px-2.5 py-1 text-sm" aria-label={`Aggiungi ${placeholder.toLowerCase()}`}>
        +
      </button>
    </form>
  );
}

function IconBtn({ title, onClick, danger, children }: { title: string; onClick: () => void; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded text-xs text-muted transition hover:bg-white/5 ${
        danger ? "hover:text-red-400" : "hover:text-accent"
      }`}
    >
      {children}
    </button>
  );
}

function DragHandle() {
  return (
    <span className="cursor-grab pl-2 text-muted select-none active:cursor-grabbing" title="Trascina per spostare" aria-hidden>
      ⠿
    </span>
  );
}

function Chevron({ up }: { up: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`shrink-0 text-accent transition-transform ${up ? "rotate-180" : ""}`}
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
