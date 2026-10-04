"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { NewsForm, sanitize, when, type News } from "./NewsPanel";

// Notizie ON come un libro aperto (stile del Manuale):
// a destra solo l'ultima notizia, a sinistra l'indice con l'archivio delle
// notizie sostituite. Le scrive chi ha il permesso "Notizie ON"
export default function NewsBook({ canWrite }: { canWrite: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [list, setList] = useState<News[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [editing, setEditing] = useState<News | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    supabase
      .from("news")
      .select("id, title, body, created_at, updated_at")
      .eq("kind", "on")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) setError("Impossibile caricare le notizie.");
        setList(data ?? []);
      });
  }, [supabase, version]);

  const latest = list?.[0] ?? null;
  const archive = list?.slice(1) ?? [];
  const selected = list?.find((n) => n.id === selectedId) ?? latest;

  async function remove(n: News) {
    if (!window.confirm(`Eliminare la notizia "${n.title}"?`)) return;
    const { error } = await supabase.from("news").delete().eq("id", n.id);
    if (error) return setError("Notizia non eliminata.");
    setSelectedId(null);
    setVersion((v) => v + 1);
  }

  const item = (n: News) => (
    <li key={n.id}>
      <button
        type="button"
        onClick={() => {
          setSelectedId(n.id);
          setEditing(null);
        }}
        className={`w-full py-0.5 pl-6 text-left text-[0.8125rem] transition ${
          n.id === selected?.id ? "font-bold text-[#5a1408] before:mr-1 before:content-['➤']" : "text-[#3b2a1a] hover:underline"
        }`}
      >
        {n.title}
        <span className="block text-[0.6875rem] font-normal text-[#7a6248]">{when(n.created_at)}</span>
      </button>
    </li>
  );

  return (
    <div className="book flex h-full flex-col p-2 md:flex-row md:p-4">
      {/* Pagina sinistra: ultima notizia e archivio */}
      <aside className="book-page book-page-left max-h-60 shrink-0 space-y-3 overflow-y-auto px-8 py-8 md:max-h-none md:w-80">
        {list === null && !error && <p className="text-sm text-[#7a6248]">Caricamento...</p>}
        {list?.length === 0 && <p className="text-sm text-[#7a6248]">Nessuna notizia.</p>}
        {latest && (
          <div>
            <p className="flex items-center gap-1.5 py-1 font-serif text-sm font-bold tracking-wider text-[#8b2a14] uppercase">
              <Chevron up />
              Ultima notizia
            </p>
            <ul className="pb-1">{item(latest)}</ul>
          </div>
        )}
        {archive.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setArchiveOpen((v) => !v)}
              aria-expanded={archiveOpen}
              className="flex w-full items-center gap-1.5 py-1 text-left font-serif text-sm font-bold tracking-wider text-[#8b2a14] uppercase hover:text-[#5a1408]"
            >
              <Chevron up={archiveOpen} />
              Archivio
              <span className="text-xs font-normal text-[#7a6248]">({archive.length})</span>
            </button>
            {archiveOpen && <ul className="space-y-1 pb-1">{archive.map(item)}</ul>}
          </div>
        )}
      </aside>

      {/* Dorso con gli anelli (solo schermi larghi) */}
      <div className="book-spine hidden md:block" aria-hidden />

      {/* Pagina destra: la notizia. In scrittura l'editor resta su fondo scuro */}
      <section className={`flex min-h-0 min-w-0 flex-1 flex-col px-10 py-8 ${editing ? "book-page-editing" : "book-page book-page-right"}`}>
        {canWrite && !editing && (
          <div className="mb-3 flex shrink-0 flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setEditing("new")} className="book-btn">
              + Nuova notizia
            </button>
            {selected && (
              <>
                <button type="button" onClick={() => setEditing(selected)} className="book-btn">
                  ✎ Modifica
                </button>
                <button type="button" onClick={() => remove(selected)} className="book-btn">
                  Elimina
                </button>
              </>
            )}
          </div>
        )}
        {error && <p className="mb-3 text-sm text-red-700">{error}</p>}

        <div className="min-h-0 flex-1 overflow-y-auto pr-2">
          {editing ? (
            <>
              {editing === "new" && (
                <p className="mb-3 text-sm text-muted">
                  La nuova notizia prende il posto di quella attuale, che passa nell&apos;archivio.
                </p>
              )}
              <NewsForm
                kind="on"
                news={editing === "new" ? null : editing}
                onDone={(saved) => {
                  setEditing(null);
                  if (saved) {
                    if (editing === "new") setSelectedId(null); // si torna all'ultima, cioe' la nuova
                    setVersion((v) => v + 1);
                  }
                }}
              />
            </>
          ) : selected ? (
            <article className="guide-content on-parchment">
              <h2>{selected.title}</h2>
              <div className="mb-4 text-center text-sm text-[#7a6248] italic">
                {when(selected.created_at)}
                {selected.id !== latest?.id && " · dall'archivio"}
              </div>
              <div dangerouslySetInnerHTML={{ __html: sanitize(selected.body) }} />
            </article>
          ) : (
            list && <p className="py-10 text-center text-[#7a6248] italic">Nessuna notizia dal mondo di gioco, per ora.</p>
          )}
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
      className={`shrink-0 transition-transform ${up ? "" : "-rotate-90"}`}
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
