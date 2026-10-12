"use client";

import DOMPurify from "dompurify";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import RichEditor from "@/components/guide/RichEditor";
import { createClient } from "@/lib/supabase/client";

type Section = { id: string; title: string; sort_order: number };
type Item = { id: string; section_id: string; question: string; answer: string; sort_order: number };

const clean = (html: string) => (typeof window === "undefined" ? "" : DOMPurify.sanitize(html, { USE_PROFILES: { html: true } }));

// Matita: il comando di modifica, discreto (lo vede solo chi puo' scrivere le FAQ)
function Pencil({ label, onClick, className = "" }: { label: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded text-muted transition hover:bg-white/5 hover:text-accent ${className}`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" />
      </svg>
    </button>
  );
}

// FAQ: sezioni a tendina con dentro domande e risposte. Le scrive chi puo'
// modificare la documentazione (come Manuale e Ambientazione)
export default function FaqPanel({ canEdit }: { canEdit: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [sections, setSections] = useState<Section[] | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [missing, setMissing] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ item: Item | null; sectionId: string } | null>(null);
  const [managing, setManaging] = useState(false); // ordina, crea ed elimina le sezioni
  // sezione che si sta rinominando: il nome si scrive direttamente al suo posto
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, i] = await Promise.all([
      supabase.from("faq_sections").select("*").order("sort_order").order("created_at"),
      supabase.from("faq_items").select("*").order("sort_order").order("created_at"),
    ]);
    setMissing(!!s.error);
    setSections((s.data ?? []) as Section[]);
    setItems((i.data ?? []) as Item[]);
  }, [supabase]);
  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  if (sections === null) return <p className="text-muted">Caricamento...</p>;
  if (missing) return <p className="text-amber-200">Per le FAQ va eseguita la migrazione 0127 in Supabase.</p>;

  const op = async (run: () => PromiseLike<{ error: { code?: string } | null }>) => {
    const { error } = await run();
    setError(error ? (error.code === "42501" ? "Non hai il permesso di modificare le FAQ." : "Salvataggio non riuscito.") : null);
    if (!error) load();
    return !error;
  };
  // salva il nuovo ordine (l'elenco arriva gia' nell'ordine voluto)
  const saveOrder = async (table: "faq_sections" | "faq_items", ids: string[]) => {
    for (const [order, id] of ids.entries()) {
      const { error } = await supabase.from(table).update({ sort_order: order }).eq("id", id);
      if (error) return setError("Ordine non salvato.");
    }
    load();
  };

  if (editing)
    return (
      <ItemForm
        item={editing.item}
        sectionId={editing.sectionId}
        sections={sections}
        nextOrder={items.filter((i) => i.section_id === editing.sectionId).length}
        onCancel={() => setEditing(null)}
        onSaved={(id, sectionId) => {
          setEditing(null);
          setOpenSection(sectionId);
          setOpenItem(id);
          load();
        }}
        onDeleted={() => {
          setEditing(null);
          load();
        }}
      />
    );

  if (managing)
    return (
      <ManageSections
        sections={sections}
        items={items}
        error={error}
        onDone={() => {
          setError(null);
          setManaging(false);
        }}
        onReorderSections={(ids) => {
          setSections(ids.flatMap((id) => sections.filter((s) => s.id === id)));
          saveOrder("faq_sections", ids);
        }}
        onReorderItems={(sectionId, ids) => {
          const moved = ids.flatMap((id) => items.filter((i) => i.id === id));
          setItems([...items.filter((i) => i.section_id !== sectionId), ...moved]);
          saveOrder("faq_items", ids);
        }}
        onCreate={(title) => op(() => supabase.from("faq_sections").insert({ title, sort_order: sections.length }))}
        onDelete={(s) => op(() => supabase.from("faq_sections").delete().eq("id", s.id))}
      />
    );

  const q = query.trim().toLowerCase();
  const match = (i: Item) => !q || i.question.toLowerCase().includes(q) || i.answer.toLowerCase().includes(q);

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div className="flex items-center gap-2">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca nelle FAQ..." className="input min-w-0 flex-1" />
        {/* matita generale: ordina, crea ed elimina le sezioni */}
        {canEdit && <Pencil label="Modifica le sezioni delle FAQ" onClick={() => setManaging(true)} className="border border-border" />}
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {sections.length === 0 && (
        <p className="py-6 text-center text-muted">
          Non ci sono ancora FAQ.{canEdit ? " Premi la matita in alto per creare la prima sezione." : ""}
        </p>
      )}

      {sections.map((s) => {
        const list = items.filter((i) => i.section_id === s.id);
        const visible = list.filter(match);
        if (q && visible.length === 0) return null;
        const isOpen = !!q || openSection === s.id;
        return (
          <section key={s.id} className="border border-border bg-black/40">
            {renaming?.id === s.id ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const title = renaming.title.trim();
                  if (!title) return;
                  if (title === s.title || (await op(() => supabase.from("faq_sections").update({ title }).eq("id", s.id)))) setRenaming(null);
                }}
                className="flex flex-wrap items-center gap-2 px-3 py-2"
              >
                <input
                  value={renaming.title}
                  onChange={(e) => setRenaming({ id: s.id, title: e.target.value })}
                  maxLength={120}
                  autoFocus
                  aria-label="Nome della sezione"
                  className="input min-w-0 flex-1 py-1"
                />
                <button className="btn px-3 py-1 text-xs" disabled={!renaming.title.trim()}>
                  Salva
                </button>
                <button type="button" onClick={() => setRenaming(null)} className="btn-ghost px-3 py-1 text-xs">
                  Annulla
                </button>
              </form>
            ) : (
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => setOpenSection(isOpen && !q ? null : s.id)}
                  aria-expanded={isOpen}
                  className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left transition hover:bg-white/5"
                >
                  <span aria-hidden className={`shrink-0 text-xs text-muted transition-transform ${isOpen ? "rotate-90" : ""}`}>
                    ▶
                  </span>
                  <span className="min-w-0 font-serif text-lg tracking-wide break-words text-accent">{s.title}</span>
                </button>
                {canEdit && (
                  <Pencil
                    label={`Rinomina la sezione ${s.title}`}
                    onClick={() => {
                      setError(null);
                      setRenaming({ id: s.id, title: s.title });
                    }}
                  />
                )}
              </div>
            )}
            {isOpen && (
              <div className="space-y-1 border-t border-border/60 p-2">
                {visible.map((it) => {
                  const on = !!q || openItem === it.id;
                  return (
                    <div key={it.id} className="border border-border/50 bg-black/40">
                      <div className="flex items-center">
                        <button
                          type="button"
                          onClick={() => setOpenItem(on && !q ? null : it.id)}
                          aria-expanded={on}
                          className="flex min-w-0 flex-1 items-start gap-2 px-3 py-2 text-left text-sm transition hover:bg-white/5"
                        >
                          <span aria-hidden className={`mt-1 shrink-0 text-[0.625rem] text-blood transition-transform ${on ? "rotate-90" : ""}`}>
                            ▶
                          </span>
                          <span className="min-w-0 font-semibold break-words">{it.question}</span>
                        </button>
                        {canEdit && <Pencil label={`Modifica la domanda: ${it.question}`} onClick={() => setEditing({ item: it, sectionId: s.id })} />}
                      </div>
                      {on && (
                        <div
                          className="guide-content overflow-x-auto border-t border-border/50 px-4 py-3 text-sm break-words"
                          dangerouslySetInnerHTML={{ __html: clean(it.answer) }}
                        />
                      )}
                    </div>
                  );
                })}
                {list.length === 0 && <p className="px-2 py-1 text-sm text-muted">Nessuna domanda in questa sezione.</p>}
                {canEdit && (
                  <button type="button" onClick={() => setEditing({ item: null, sectionId: s.id })} className="btn-ghost mt-1 px-3 py-1 text-xs">
                    + Aggiungi una domanda
                  </button>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------
// Elenco che si riordina trascinando la maniglia (anche col dito)
// ---------------------------------------------------------------------
function Reorder<T extends { id: string }>({
  items,
  onReorder,
  render,
}: {
  items: T[];
  onReorder: (ids: string[]) => void;
  render: (item: T) => ReactNode;
}) {
  // durante il trascinamento l'ordine cambia solo qui; al rilascio si salva
  const [order, setOrder] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());
  const ids = order ?? items.map((i) => i.id);
  const list = ids.flatMap((id) => items.filter((i) => i.id === id));

  function start(e: PointerEvent<HTMLButtonElement>, id: string) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragId(id);
    setOrder(items.map((i) => i.id));
  }
  function move(e: PointerEvent<HTMLButtonElement>) {
    if (!dragId || !order) return;
    // sopra quale riga si trova il puntatore
    const over = order.find((id) => {
      const r = rows.current.get(id)?.getBoundingClientRect();
      return !!r && e.clientY >= r.top && e.clientY <= r.bottom;
    });
    if (!over || over === dragId) return;
    const next = order.filter((id) => id !== dragId);
    next.splice(order.indexOf(over), 0, dragId);
    setOrder(next);
  }
  function end() {
    if (order && order.join() !== items.map((i) => i.id).join()) onReorder(order);
    setDragId(null);
    setOrder(null);
  }

  return (
    <ul className="space-y-1">
      {list.map((item) => (
        <li
          key={item.id}
          ref={(el) => {
            if (el) rows.current.set(item.id, el);
            else rows.current.delete(item.id);
          }}
          className={`flex items-center gap-1 border bg-black/40 transition ${dragId === item.id ? "border-accent bg-blood/20 shadow-lg shadow-black" : "border-border"}`}
        >
          <button
            type="button"
            onPointerDown={(e) => start(e, item.id)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            aria-label="Trascina per spostare"
            title="Trascina per spostare"
            className="flex h-10 w-9 shrink-0 cursor-grab touch-none items-center justify-center text-muted select-none hover:text-accent active:cursor-grabbing"
          >
            <svg width="14" height="18" viewBox="0 0 14 18" fill="currentColor" aria-hidden>
              <circle cx="4" cy="3" r="1.6" />
              <circle cx="10" cy="3" r="1.6" />
              <circle cx="4" cy="9" r="1.6" />
              <circle cx="10" cy="9" r="1.6" />
              <circle cx="4" cy="15" r="1.6" />
              <circle cx="10" cy="15" r="1.6" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">{render(item)}</div>
        </li>
      ))}
    </ul>
  );
}

// Matita generale: ordina le sezioni (e le domande dentro) trascinando, crea ed elimina le sezioni
function ManageSections({
  sections,
  items,
  error,
  onDone,
  onReorderSections,
  onReorderItems,
  onCreate,
  onDelete,
}: {
  sections: Section[];
  items: Item[];
  error: string | null;
  onDone: () => void;
  onReorderSections: (ids: string[]) => void;
  onReorderItems: (sectionId: string, ids: string[]) => void;
  onCreate: (title: string) => Promise<boolean>;
  onDelete: (s: Section) => void;
}) {
  const [title, setTitle] = useState("");
  const [inside, setInside] = useState<string | null>(null); // sezione di cui si ordinano le domande
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-serif text-lg text-accent">Sezioni delle FAQ</h3>
        <button type="button" onClick={onDone} className="btn px-3 py-1 text-xs">
          Fatto
        </button>
      </div>
      <p className="text-xs text-muted">Trascina la maniglia a sinistra per spostare una sezione in alto o in basso.</p>
      {error && <p className="text-sm text-red-400">{error}</p>}

      {sections.length === 0 ? (
        <p className="text-sm text-muted">Nessuna sezione: creane una qui sotto.</p>
      ) : (
        <Reorder
          items={sections}
          onReorder={onReorderSections}
          render={(s) => {
            const list = items.filter((i) => i.section_id === s.id);
            return (
              <div>
                <div className="flex items-center gap-1 py-1 pr-1">
                  <span className="min-w-0 flex-1 font-serif break-words text-accent">{s.title}</span>
                  {list.length > 1 && (
                    <button type="button" onClick={() => setInside(inside === s.id ? null : s.id)} className="shrink-0 px-2 py-1 text-xs text-muted hover:text-accent">
                      {inside === s.id ? "Chiudi" : "Ordina domande"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      window.confirm(
                        list.length ? `Eliminare la sezione "${s.title}" con tutte le sue ${list.length} domande?` : `Eliminare la sezione "${s.title}"?`,
                      ) && onDelete(s)
                    }
                    aria-label={`Elimina la sezione ${s.title}`}
                    title="Elimina la sezione"
                    className="flex h-8 w-8 shrink-0 items-center justify-center text-red-400 hover:text-red-300"
                  >
                    ✕
                  </button>
                </div>
                {inside === s.id && (
                  <div className="pr-1 pb-2">
                    <Reorder items={list} onReorder={(ids) => onReorderItems(s.id, ids)} render={(it) => <span className="block py-2 pr-2 text-sm break-words">{it.question}</span>} />
                  </div>
                )}
              </div>
            );
          }}
        />
      )}

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const t = title.trim();
          if (t && (await onCreate(t))) setTitle("");
        }}
        className="flex flex-wrap items-center gap-2 border-t border-border pt-4"
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Nome della nuova sezione" className="input min-w-0 flex-1" />
        <button className="btn px-4" disabled={!title.trim()}>
          Crea sezione
        </button>
      </form>
    </div>
  );
}

function ItemForm({
  item,
  sectionId,
  sections,
  nextOrder,
  onCancel,
  onSaved,
  onDeleted,
}: {
  item: Item | null;
  sectionId: string;
  sections: Section[];
  nextOrder: number;
  onCancel: () => void;
  onSaved: (id: string, sectionId: string) => void;
  onDeleted: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [section, setSection] = useState(sectionId);
  const [question, setQuestion] = useState(item?.question ?? "");
  const [answer, setAnswer] = useState(item?.answer ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!question.trim()) return setError("Scrivi la domanda.");
    setBusy(true);
    setError(null);
    const row = { section_id: section, question: question.trim(), answer };
    const res = item
      ? await supabase.from("faq_items").update(row).eq("id", item.id).select("id").single()
      : await supabase.from("faq_items").insert({ ...row, sort_order: nextOrder }).select("id").single();
    setBusy(false);
    if (res.error) return setError(res.error.code === "42501" ? "Non hai il permesso di modificare le FAQ." : "Salvataggio non riuscito.");
    onSaved(res.data.id as string, section);
  }

  async function remove() {
    if (!item || !window.confirm("Eliminare questa domanda?")) return;
    setBusy(true);
    const { error } = await supabase.from("faq_items").delete().eq("id", item.id);
    setBusy(false);
    if (error) return setError("Eliminazione non riuscita.");
    onDeleted();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h3 className="font-serif text-xl text-accent">{item ? "Modifica domanda" : "Nuova domanda"}</h3>
      <label className="block space-y-1 text-xs tracking-wide text-muted uppercase">
        Sezione
        <select value={section} onChange={(e) => setSection(e.target.value)} className="input normal-case">
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1 text-xs tracking-wide text-muted uppercase">
        Domanda
        <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={300} className="input normal-case" />
      </label>
      <div className="space-y-1">
        <span className="block text-xs tracking-wide text-muted uppercase">Risposta</span>
        <RichEditor value={answer} onChange={setAnswer} scroll />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={save} disabled={busy} className="btn px-4">
          {busy ? "Salvataggio..." : "Salva"}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost px-4">
          Annulla
        </button>
        {item && (
          <button type="button" onClick={remove} disabled={busy} className="btn-ghost ml-auto border-red-900 px-4 text-red-400 hover:border-red-500">
            Elimina
          </button>
        )}
      </div>
    </div>
  );
}
