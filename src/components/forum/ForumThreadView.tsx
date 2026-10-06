"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RichEditor from "@/components/guide/RichEditor";
import { cleanPlayerHtml } from "@/components/scheda/player-html";
import { createClient } from "@/lib/supabase/client";
import {
  THREAD_SELECT,
  when,
  type ForumPost,
  type ForumSection,
  type ForumThread,
} from "./forum-data";

const POST_SELECT = "*, author:characters(avatar_url)";

// Una discussione: interventi in ordine, risposta con l'editor in fondo.
// Ognuno modifica i propri interventi; i moderatori modificano ed eliminano
// quelli di tutti, e chiudono, fissano, rendono importanti, spostano le discussioni
export default function ForumThreadView({
  threadId,
  userId,
  canModerate,
  sections,
  onBack,
  onChanged,
}: {
  threadId: string;
  userId: string;
  canModerate: boolean;
  sections: ForumSection[];
  onBack: (sectionId?: string) => void;
  onChanged: () => void; // letti / non letti e liste da aggiornare
}) {
  const supabase = useMemo(() => createClient(), []);
  const [thread, setThread] = useState<ForumThread | null | undefined>(
    undefined,
  );
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [reply, setReply] = useState("");
  const [replyKey, setReplyKey] = useState(0); // svuota l'editor dopo l'invio
  const [writing, setWriting] = useState(false); // editor della risposta aperto (sotto l'ultimo intervento)
  const canReply = !!thread && (!thread.locked || canModerate);

  // "Rispondi": apre l'editor sotto l'ultimo intervento e ci porta la pagina
  function openReply() {
    setWriting(true);
    setTimeout(
      () =>
        bottom.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      50,
    );
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null); // nuovo titolo mentre si rinomina
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(
    () =>
      Promise.all([
        supabase
          .from("forum_threads")
          .select(THREAD_SELECT)
          .eq("id", threadId)
          .maybeSingle(),
        supabase
          .from("forum_posts")
          .select(POST_SELECT)
          .eq("thread_id", threadId)
          .order("created_at"),
      ]).then(([t, p]) => {
        setThread((t.data as ForumThread | null) ?? null);
        setPosts((p.data ?? []) as ForumPost[]);
      }),
    [supabase, threadId],
  );

  useEffect(() => {
    load().then(() =>
      supabase
        .rpc("forum_mark_read", { p_thread: threadId })
        .then(() => onChanged()),
    );
  }, [load, supabase, threadId, onChanged]);

  async function send() {
    if (!stripped(reply))
      return setError("Scrivi qualcosa prima di rispondere.");
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("forum_reply", {
      p_thread: threadId,
      p_body: reply,
    });
    setBusy(false);
    if (error)
      return setError(
        error.message.includes("chiusa")
          ? "La discussione è chiusa."
          : "Risposta non pubblicata.",
      );
    setReply("");
    setReplyKey((k) => k + 1);
    setWriting(false);
    await load();
    onChanged();
    setTimeout(
      () => bottom.current?.scrollIntoView({ behavior: "smooth" }),
      50,
    );
  }

  async function moderate(action: string, value?: string) {
    setError(null);
    const { error } = await supabase.rpc("forum_moderate_thread", {
      p_thread: threadId,
      p_action: action,
      p_value: value ?? null,
    });
    if (error) return setError("Operazione non riuscita.");
    onChanged();
    if (action === "elimina") return onBack(thread?.section_id);
    load();
  }

  async function removePost(p: ForumPost, first: boolean) {
    if (
      !window.confirm(
        first
          ? "È il primo intervento: si elimina tutta la discussione. Continuare?"
          : "Eliminare questo intervento?",
      )
    )
      return;
    const { error } = await supabase.rpc("forum_delete_post", { p_post: p.id });
    if (error) return setError("Intervento non eliminato.");
    onChanged();
    if (first) return onBack(thread?.section_id);
    load();
  }

  if (thread === undefined)
    return <p className="p-6 text-muted">Caricamento...</p>;
  if (thread === null)
    return <p className="p-6 text-muted">Discussione non trovata.</p>;

  return (
    <div className="space-y-4 p-5">
      <div>
        <button
          type="button"
          onClick={() => onBack(thread.section_id)}
          className="text-sm text-muted hover:text-accent"
        >
          ← {thread.section?.name ?? "Sezione"}
        </button>
        <h2 className="mt-1 flex flex-wrap items-center gap-2 font-serif text-2xl text-accent">
          {thread.pinned && <PinIcon />}
          {thread.title}
          {thread.locked && (
            <span className="border border-border px-2 py-0.5 font-sans text-xs tracking-wider text-muted uppercase">
              Chiusa
            </span>
          )}
          {thread.important && (
            <span className="border border-[#d4a72c]/60 px-2 py-0.5 font-sans text-xs tracking-wider text-[#f0c75e] uppercase">
              Importante
            </span>
          )}
        </h2>
      </div>

      {canReply && !writing && posts.length > 3 && (
        <button
          type="button"
          onClick={openReply}
          className="btn-ghost px-4 py-1.5 text-xs tracking-[0.14em] uppercase"
        >
          Rispondi ↓
        </button>
      )}

      {canModerate && (
        <div className="flex flex-wrap items-center gap-2 border border-dashed border-accent/40 bg-black/30 px-3 py-2 text-xs">
          <span className="text-muted">Moderazione:</span>
          <button
            type="button"
            onClick={() => moderate("fissa", String(!thread.pinned))}
            className="btn-ghost px-2 py-1 text-xs"
          >
            {thread.pinned ? "Togli da in alto" : "Fissa in alto"}
          </button>
          <button
            type="button"
            onClick={() => moderate("importante", String(!thread.important))}
            className="btn-ghost px-2 py-1 text-xs"
          >
            {thread.important ? "Non più importante" : "Rendi importante"}
          </button>
          <button
            type="button"
            onClick={() => moderate("chiudi", String(!thread.locked))}
            className="btn-ghost px-2 py-1 text-xs"
          >
            {thread.locked ? "Riapri" : "Chiudi"}
          </button>
          {renaming === null ? (
            <button
              type="button"
              onClick={() => setRenaming(thread.title)}
              className="btn-ghost px-2 py-1 text-xs"
            >
              Rinomina
            </button>
          ) : (
            <span className="flex flex-wrap items-center gap-1">
              <input
                value={renaming}
                onChange={(e) => setRenaming(e.target.value)}
                maxLength={120}
                aria-label="Nuovo titolo della discussione"
                autoFocus
                className="input w-56! py-1 text-xs"
              />
              <button
                type="button"
                disabled={!renaming.trim() || renaming.trim() === thread.title}
                onClick={() =>
                  moderate("titolo", renaming.trim()).then(() =>
                    setRenaming(null),
                  )
                }
                className="btn px-2 py-1 text-xs"
              >
                Salva titolo
              </button>
              <button
                type="button"
                onClick={() => setRenaming(null)}
                className="btn-ghost px-2 py-1 text-xs"
              >
                Annulla
              </button>
            </span>
          )}
          <select
            value=""
            onChange={(e) =>
              e.target.value && moderate("sposta", e.target.value)
            }
            aria-label="Sposta in un'altra sezione"
            className="input w-44! py-1 text-xs"
          >
            <option value="">Sposta in…</option>
            {sections
              .filter((s) => s.id !== thread.section_id)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
          <button
            type="button"
            onClick={() =>
              window.confirm("Eliminare tutta la discussione?") &&
              moderate("elimina")
            }
            className="ml-auto px-2 py-1 text-xs text-red-400 hover:text-red-300"
          >
            Elimina discussione
          </button>
        </div>
      )}
      {error && !writing && <p className="text-sm text-red-400">{error}</p>}

      <ul className="space-y-3">
        {posts.map((p, i) => (
          <li
            key={p.id}
            className="flex gap-3 border border-border/60 bg-black/30 p-3"
          >
            <div className="hidden w-24 shrink-0 text-center sm:block">
              {p.author?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.author.avatar_url}
                  alt=""
                  className="mx-auto h-16 w-16 border border-[#3a2c2a] object-cover"
                />
              ) : (
                <span className="mx-auto flex h-16 w-16 items-center justify-center border border-[#3a2c2a] bg-black/40 font-serif text-2xl text-accent">
                  {p.author_name[0] ?? "?"}
                </span>
              )}
              <p className="mt-1 font-serif text-sm break-words text-accent">
                {p.author_name}
              </p>
            </div>
            <div className="min-w-0 flex-1">
              <p className="mb-2 flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 pb-1 text-xs text-muted">
                <span>
                  <span className="font-serif text-sm text-accent sm:hidden">
                    {p.author_name} ·{" "}
                  </span>
                  {when(p.created_at)}
                  {p.edited_at && (
                    <span className="italic">
                      {" "}
                      · modificato{" "}
                      {p.edited_by_name && p.edited_by_name !== p.author_name
                        ? `da ${p.edited_by_name} `
                        : ""}
                      il {when(p.edited_at)}
                    </span>
                  )}
                </span>
                {editing !== p.id && (
                  <span className="flex gap-3">
                    {(p.author_id === userId || canModerate) && (
                      <button
                        type="button"
                        onClick={() => setEditing(p.id)}
                        className="hover:text-accent"
                      >
                        Modifica
                      </button>
                    )}
                    {canModerate && (
                      <button
                        type="button"
                        onClick={() => removePost(p, i === 0)}
                        className="text-red-400 hover:text-red-300"
                      >
                        Elimina
                      </button>
                    )}
                  </span>
                )}
              </p>
              {editing === p.id ? (
                <PostEditor
                  post={p}
                  onDone={(saved) => {
                    setEditing(null);
                    if (saved) load();
                  }}
                />
              ) : (
                <PostBody html={p.body} />
              )}
            </div>
          </li>
        ))}
      </ul>
      <div ref={bottom} />

      {!canReply ? (
        <p className="border border-border/60 bg-black/30 px-3 py-2 text-sm text-muted">
          La discussione è chiusa: non si può più rispondere.
        </p>
      ) : writing ? (
        <div className="space-y-2 border border-border/60 bg-black/30 p-3">
          <h3 className="font-serif text-lg text-[#d8c39a]">La tua risposta</h3>
          <RichEditor
            key={replyKey}
            value={reply}
            onChange={setReply}
            textClassName="forum-text"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={send}
              className="btn px-5 py-1.5 text-sm"
            >
              {busy ? "Invio..." : "Invia risposta"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (
                  stripped(reply) &&
                  !window.confirm(
                    "Chiudere senza inviare? Quello che hai scritto resta qui finché non lasci la discussione.",
                  )
                )
                  return;
                setWriting(false);
              }}
              className="btn-ghost px-4 py-1.5 text-sm"
            >
              Annulla
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={openReply}
          className="btn px-6 py-2 text-sm tracking-[0.14em] uppercase"
        >
          Rispondi
        </button>
      )}
    </div>
  );
}

// Testo vuoto anche se l'editor lascia un <p></p>
export const stripped = (html: string) =>
  html
    .replace(/<(?!img)[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim() || /<img/i.test(html);

export function PostBody({ html }: { html: string }) {
  const clean = useMemo(() => cleanPlayerHtml(html), [html]);
  // contain: paint tiene dentro il riquadro anche gli stili scritti dai giocatori
  return (
    <div
      className="guide-content forum-text overflow-hidden break-words [contain:paint]"
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}

function PostEditor({
  post,
  onDone,
}: {
  post: ForumPost;
  onDone: (saved: boolean) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [body, setBody] = useState(post.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!stripped(body)) return setError("L'intervento non può restare vuoto.");
    setBusy(true);
    const { error } = await supabase.rpc("forum_edit_post", {
      p_post: post.id,
      p_body: body,
    });
    setBusy(false);
    if (error) return setError("Modifica non salvata.");
    onDone(true);
  }

  return (
    <div className="space-y-2">
      <RichEditor value={body} onChange={setBody} textClassName="forum-text" />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="btn px-4 py-1.5 text-sm"
        >
          Salva
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDone(false)}
          className="btn-ghost px-4 py-1.5 text-sm"
        >
          Annulla
        </button>
      </div>
    </div>
  );
}

export function PinIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="#d4a72c"
      aria-label="Fissata in alto"
      className="shrink-0"
    >
      <path d="M14.5 2 22 9.5l-2.1.7-3.6 3.6.4 4.9-2.1 2.1-4.2-4.2L4.6 22 2 19.4l5.8-5.8-4.2-4.2 2.1-2.1 4.9.4 3.6-3.6Z" />
    </svg>
  );
}
