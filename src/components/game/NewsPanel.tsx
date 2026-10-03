"use client";

import DOMPurify from "dompurify";
import { useEffect, useMemo, useState } from "react";
import RichEditor from "@/components/guide/RichEditor";
import { createClient } from "@/lib/supabase/client";

export type NewsKind = "on" | "off";
export type News = { id: string; title: string; body: string; created_at: string; updated_at: string };

export const sanitize = (html: string) => DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
export const when = (iso: string) =>
  new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });

// Notizie ON (dal mondo di gioco) e OFF (comunicazioni dello staff):
// le leggono tutti, le scrive chi ha il permesso "Annunci globali"
export default function NewsPanel({ kind, canWrite }: { kind: NewsKind; canWrite: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [list, setList] = useState<News[] | null>(null);
  const [editing, setEditing] = useState<News | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    supabase
      .from("news")
      .select("id, title, body, created_at, updated_at")
      .eq("kind", kind)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setList(data ?? []));
  }, [supabase, kind, version]);

  async function remove(n: News) {
    if (!window.confirm(`Eliminare la notizia "${n.title}"?`)) return;
    const { error } = await supabase.from("news").delete().eq("id", n.id);
    if (error) setError("Notizia non eliminata.");
    else setVersion((v) => v + 1);
  }

  if (editing)
    return (
      <NewsForm
        kind={kind}
        news={editing === "new" ? null : editing}
        onDone={(saved) => {
          setEditing(null);
          if (saved) setVersion((v) => v + 1);
        }}
      />
    );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {kind === "on"
          ? "Le notizie dal mondo di gioco: ciò che accade nei Sette Regni."
          : "Le comunicazioni dello staff fuori dal gioco: novità del sito, regole, eventi."}
      </p>
      {canWrite && (
        <button type="button" onClick={() => setEditing("new")} className="btn px-3 py-1.5 text-sm">
          Nuova notizia
        </button>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      {list === null && <p className="text-sm text-muted">Caricamento...</p>}
      {list?.length === 0 && <p className="py-6 text-center text-muted">Nessuna notizia, per ora.</p>}
      {list?.map((n) => (
        <article key={n.id} className="border border-border bg-black/40 p-4">
          <header className="mb-2 flex flex-wrap items-baseline gap-x-3 border-b border-border/60 pb-2">
            <h3 className="flex-1 font-serif text-xl text-accent">{n.title}</h3>
            <span className="text-xs text-muted">{when(n.created_at)}</span>
            {canWrite && (
              <span className="flex gap-2 text-xs">
                <button type="button" onClick={() => setEditing(n)} className="text-muted hover:text-accent">
                  Modifica
                </button>
                <button type="button" onClick={() => remove(n)} className="text-red-400 hover:text-red-300">
                  Elimina
                </button>
              </span>
            )}
          </header>
          <div className="guide-content" dangerouslySetInnerHTML={{ __html: sanitize(n.body) }} />
        </article>
      ))}
    </div>
  );
}

export function NewsForm({ kind, news, onDone }: { kind: NewsKind; news: News | null; onDone: (saved: boolean) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [title, setTitle] = useState(news?.title ?? "");
  const [body, setBody] = useState(news?.body ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!title.trim()) return setError("Scrivi un titolo.");
    setBusy(true);
    const row = { title: title.trim().slice(0, 150), body: sanitize(body) };
    const { error } = news
      ? await supabase.from("news").update({ ...row, updated_at: new Date().toISOString() }).eq("id", news.id)
      : await supabase.from("news").insert({ ...row, kind });
    setBusy(false);
    if (error) setError("Notizia non salvata.");
    else onDone(true);
  }

  return (
    <div className="space-y-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={150}
        placeholder="Titolo"
        aria-label="Titolo"
        className="input font-serif text-lg"
      />
      <RichEditor value={body} onChange={setBody} />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={save} className="btn px-3 py-1.5 text-sm">
          {news ? "Salva" : "Pubblica"}
        </button>
        <button type="button" disabled={busy} onClick={() => onDone(false)} className="btn-ghost px-3 py-1.5 text-sm">
          Annulla
        </button>
      </div>
    </div>
  );
}
