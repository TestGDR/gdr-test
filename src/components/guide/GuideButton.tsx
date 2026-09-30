"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ModalButton from "@/components/ui/ModalButton";
import { createClient } from "@/lib/supabase/client";

type Book = "manuale" | "ambientazione";

type PageMeta = {
  id: string;
  section: string;
  section_order: number;
  title: string;
  sort_order: number;
};

const META_COLUMNS = "id, section, section_order, title, sort_order";

// Link della barra in alto che apre Manuale di Gioco o Ambientazione in una modale
export default function GuideButton({ book, label }: { book: Book; label: string }) {
  // Il contenuto si carica solo alla prima apertura, non a ogni pagina visitata
  const [opened, setOpened] = useState(false);

  return (
    <ModalButton
      label={label}
      title={label}
      size="xl"
      className="hover:text-accent"
      onOpen={() => setOpened(true)}
    >
      {() => (opened ? <GuideBrowser book={book} label={label} /> : null)}
    </ModalButton>
  );
}

function GuideBrowser({ book, label }: { book: Book; label: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [pages, setPages] = useState<PageMeta[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PageMeta[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Indice: sezioni e titoli delle sottosezioni
  useEffect(() => {
    supabase
      .from("guide_pages")
      .select(META_COLUMNS)
      .eq("book", book)
      .order("section_order")
      .order("sort_order")
      .then(({ data, error }) => {
        if (error) {
          setLoadError(true);
          return;
        }
        const list = (data ?? []) as PageMeta[];
        setPages(list);
        if (list[0]) {
          setOpenSection(list[0].section);
          setSelectedId(list[0].id);
        }
      });
  }, [supabase, book]);

  // Testo della sottosezione scelta (una sola volta, poi resta in memoria)
  useEffect(() => {
    if (!selectedId || bodies[selectedId] !== undefined) return;
    supabase
      .from("guide_pages")
      .select("body")
      .eq("id", selectedId)
      .single()
      .then(({ data }) => setBodies((prev) => ({ ...prev, [selectedId]: data?.body ?? "" })));
  }, [supabase, selectedId, bodies]);

  const sections = useMemo(() => {
    const map = new Map<string, PageMeta[]>();
    for (const p of pages ?? []) {
      if (!map.has(p.section)) map.set(p.section, []);
      map.get(p.section)!.push(p);
    }
    return [...map];
  }, [pages]);

  const selected = pages?.find((p) => p.id === selectedId) ?? null;

  function openPage(page: PageMeta) {
    setOpenSection(page.section);
    setSelectedId(page.id);
    setResults(null);
  }

  async function search(e: FormEvent) {
    e.preventDefault();
    // Caratteri con significato speciale nei filtri di Supabase
    const q = query.replace(/[,()*%_\\:"]/g, " ").trim();
    if (!q) {
      setResults(null);
      return;
    }
    setSearching(true);
    const { data } = await supabase
      .from("guide_pages")
      .select(META_COLUMNS)
      .eq("book", book)
      .or(`title.ilike.%${q}%,body.ilike.%${q}%`)
      .order("section_order")
      .order("sort_order");
    setSearching(false);
    setResults((data ?? []) as PageMeta[]);
  }

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Colonna sinistra: sezioni a fisarmonica */}
      <aside className="max-h-48 shrink-0 space-y-2 overflow-y-auto border-b border-border p-3 md:max-h-none md:w-80 md:border-r md:border-b-0">
        {loadError && <p className="p-2 text-sm text-red-400">Impossibile caricare i contenuti.</p>}
        {pages === null && !loadError && <p className="p-2 text-sm text-muted">Caricamento...</p>}
        {pages?.length === 0 && <p className="p-2 text-sm text-muted">Nessun contenuto.</p>}

        {sections.map(([section, items]) => {
          const isOpen = openSection === section;
          return (
            <div key={section} className="overflow-hidden rounded-md border border-border bg-black/30">
              <button
                type="button"
                onClick={() => setOpenSection(isOpen ? null : section)}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase hover:text-accent"
                aria-expanded={isOpen}
              >
                {section}
                <Chevron up={isOpen} />
              </button>
              {isOpen && (
                <ul className="border-t border-border py-1">
                  {items.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => openPage(p)}
                        className={`w-full border-l-2 px-4 py-2 text-left text-[11px] tracking-wide uppercase transition ${
                          p.id === selectedId
                            ? "border-accent bg-blood/25 font-bold text-foreground"
                            : "border-transparent text-muted hover:text-foreground"
                        }`}
                      >
                        {p.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </aside>

      {/* Parte destra: ricerca + documento */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col p-4">
        <form onSubmit={search} className="mb-4 flex shrink-0 gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Cerca in ${label}`}
            className="input flex-1"
          />
          <button className="btn text-xs tracking-widest uppercase" disabled={searching}>
            Cerca
          </button>
        </form>

        <div className="min-h-0 flex-1 overflow-y-auto pr-2">
          {results ? (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-serif text-xl text-accent">
                  {results.length} risultat{results.length === 1 ? "o" : "i"}
                </h3>
                <button
                  type="button"
                  onClick={() => setResults(null)}
                  className="text-sm text-muted hover:text-accent"
                >
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
                      <span className="block text-xs text-muted uppercase">{p.section}</span>
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
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{bodies[selected.id]}</ReactMarkdown>
              )}
            </article>
          ) : null}
        </div>
      </section>
    </div>
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
