"use client";

import DOMPurify from "dompurify";
import { useCallback, useEffect, useMemo, useState } from "react";
import RichEditor from "@/components/guide/RichEditor";
import { createClient } from "@/lib/supabase/client";

type Section = { id: string; title: string; sort_order: number };
type Item = { id: string; section_id: string; question: string; answer: string; sort_order: number };

const clean = (html: string) => (typeof window === "undefined" ? "" : DOMPurify.sanitize(html, { USE_PROFILES: { html: true } }));

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
  const [newSection, setNewSection] = useState("");
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

  const fail = (e: { code?: string } | null) => setError(e ? (e.code === "42501" ? "Non hai il permesso di modificare le FAQ." : "Salvataggio non riuscito.") : null);
  const op = async (run: () => PromiseLike<{ error: { code?: string } | null }>) => {
    const { error } = await run();
    fail(error);
    if (!error) load();
    return !error;
  };
  // sposta su o giu' scambiando l'ordine con il vicino
  const move = async <T extends { id: string; sort_order: number }>(table: "faq_sections" | "faq_items", list: T[], index: number, dir: -1 | 1) => {
    const other = list[index + dir];
    if (!other) return;
    const ordered = list.map((x, i) => ({ id: x.id, order: i }));
    [ordered[index].order, ordered[index + dir].order] = [ordered[index + dir].order, ordered[index].order];
    for (const o of ordered) await supabase.from(table).update({ sort_order: o.order }).eq("id", o.id);
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
      />
    );

  const q = query.trim().toLowerCase();
  const match = (i: Item) => !q || i.question.toLowerCase().includes(q) || i.answer.toLowerCase().includes(q);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca nelle FAQ..." className="input" />
      {error && <p className="text-sm text-red-400">{error}</p>}
      {sections.length === 0 && <p className="py-6 text-center text-muted">Non ci sono ancora FAQ.</p>}

      {sections.map((s, si) => {
        const list = items.filter((i) => i.section_id === s.id);
        const visible = list.filter(match);
        if (q && visible.length === 0) return null;
        const isOpen = !!q || openSection === s.id;
        return (
          <section key={s.id} className="border border-border bg-black/40">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOpenSection(isOpen && !q ? null : s.id)}
                aria-expanded={isOpen}
                className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left transition hover:bg-white/5"
              >
                <span aria-hidden className={`text-xs text-muted transition-transform ${isOpen ? "rotate-90" : ""}`}>
                  ▶
                </span>
                <span className="truncate font-serif text-lg tracking-wide text-accent">{s.title}</span>
                <span className="ml-auto shrink-0 text-xs text-muted">
                  {list.length} {list.length === 1 ? "domanda" : "domande"}
                </span>
              </button>
              {canEdit && (
                <span className="flex shrink-0 items-center gap-1 pr-2 text-xs text-muted">
                  <button type="button" disabled={si === 0} onClick={() => move("faq_sections", sections, si, -1)} aria-label="Sposta su" className="px-1 hover:text-accent disabled:opacity-30">
                    ↑
                  </button>
                  <button type="button" disabled={si === sections.length - 1} onClick={() => move("faq_sections", sections, si, 1)} aria-label="Sposta giù" className="px-1 hover:text-accent disabled:opacity-30">
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = window.prompt("Nome della sezione", s.title)?.trim();
                      if (next && next !== s.title) op(() => supabase.from("faq_sections").update({ title: next }).eq("id", s.id));
                    }}
                    className="px-1 hover:text-accent"
                  >
                    Rinomina
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      window.confirm(`Eliminare la sezione "${s.title}" con tutte le sue ${list.length} domande?`) &&
                      op(() => supabase.from("faq_sections").delete().eq("id", s.id))
                    }
                    className="px-1 text-red-400 hover:text-red-300"
                  >
                    Elimina
                  </button>
                </span>
              )}
            </div>
            {isOpen && (
              <div className="space-y-1 border-t border-border/60 p-2">
                {visible.map((it) => {
                  const on = !!q || openItem === it.id;
                  const idx = list.indexOf(it);
                  return (
                    <div key={it.id} className="border border-border/50 bg-black/40">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setOpenItem(on && !q ? null : it.id)}
                          aria-expanded={on}
                          className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-white/5"
                        >
                          <span aria-hidden className={`text-[0.625rem] text-blood transition-transform ${on ? "rotate-90" : ""}`}>
                            ▶
                          </span>
                          <span className="font-semibold">{it.question}</span>
                        </button>
                        {canEdit && (
                          <span className="flex shrink-0 items-center gap-1 pr-2 text-xs text-muted">
                            <button type="button" disabled={idx === 0} onClick={() => move("faq_items", list, idx, -1)} aria-label="Sposta su" className="px-1 hover:text-accent disabled:opacity-30">
                              ↑
                            </button>
                            <button type="button" disabled={idx === list.length - 1} onClick={() => move("faq_items", list, idx, 1)} aria-label="Sposta giù" className="px-1 hover:text-accent disabled:opacity-30">
                              ↓
                            </button>
                            <button type="button" onClick={() => setEditing({ item: it, sectionId: s.id })} className="px-1 hover:text-accent">
                              Modifica
                            </button>
                            <button
                              type="button"
                              onClick={() => window.confirm("Eliminare questa domanda?") && op(() => supabase.from("faq_items").delete().eq("id", it.id))}
                              className="px-1 text-red-400 hover:text-red-300"
                            >
                              Elimina
                            </button>
                          </span>
                        )}
                      </div>
                      {on && <div className="guide-content border-t border-border/50 px-4 py-3 text-sm" dangerouslySetInnerHTML={{ __html: clean(it.answer) }} />}
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

      {canEdit && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const title = newSection.trim();
            if (!title) return;
            if (await op(() => supabase.from("faq_sections").insert({ title, sort_order: sections.length }))) setNewSection("");
          }}
          className="flex flex-wrap items-center gap-2 border-t border-border pt-4"
        >
          <input value={newSection} onChange={(e) => setNewSection(e.target.value)} maxLength={120} placeholder="Nome della nuova sezione (menu a tendina)" className="input max-w-sm" />
          <button className="btn px-4" disabled={!newSection.trim()}>
            Crea sezione
          </button>
        </form>
      )}
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
}: {
  item: Item | null;
  sectionId: string;
  sections: Section[];
  nextOrder: number;
  onCancel: () => void;
  onSaved: (id: string, sectionId: string) => void;
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
      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={busy} className="btn px-4">
          {busy ? "Salvataggio..." : "Salva"}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost px-4">
          Annulla
        </button>
      </div>
    </div>
  );
}
