"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import RichEditor from "@/components/guide/RichEditor";
import { createClient } from "@/lib/supabase/client";
import ForumManage from "./ForumManage";
import ForumThreadView, {
  PinIcon,
  PostBody,
  stripped,
} from "./ForumThreadView";
import {
  THREAD_SELECT,
  when,
  type ForumCategory,
  type ForumPost,
  type ForumSection,
  type ForumThread,
  type Unread,
} from "./forum-data";

type View =
  | { kind: "ultime" }
  | { kind: "sezione"; id: string }
  | { kind: "discussione"; id: string }
  | { kind: "nuova"; sectionId: string }
  | { kind: "leggi" }
  | { kind: "gestisci" };

// Forum ON e OFF (in una finestra): a sinistra le categorie con le sezioni,
// a destra le ultime discussioni, una sezione, una discussione o "Leggi tutto"
export default function Forum({
  userId,
  canModerate,
  canManage,
  onUnreadChanged,
}: {
  userId: string;
  canModerate: boolean;
  canManage: boolean;
  onUnreadChanged: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [sections, setSections] = useState<ForumSection[]>([]);
  const [unread, setUnread] = useState<Unread[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<View>({ kind: "ultime" });
  const [menu, setMenu] = useState(false); // colonna delle sezioni sul telefono
  const [version, setVersion] = useState(0); // ricarica le liste

  const loadStructure = useCallback(
    () =>
      Promise.all([
        supabase
          .from("forum_categories")
          .select("*")
          .order("sort_order")
          .order("name"),
        supabase
          .from("forum_sections")
          .select("*")
          .order("sort_order")
          .order("name"),
      ]).then(([c, s]) => {
        setCategories((c.data ?? []) as ForumCategory[]);
        setSections((s.data ?? []) as ForumSection[]);
      }),
    [supabase],
  );

  const loadUnread = useCallback(
    () =>
      supabase
        .rpc("forum_unread")
        .then(({ data }) => setUnread((data as Unread[] | null) ?? [])),
    [supabase],
  );

  // Aggiorna non letti, liste e icona dopo ogni cambiamento
  const changed = useCallback(() => {
    loadUnread();
    setVersion((v) => v + 1);
    onUnreadChanged();
  }, [loadUnread, onUnreadChanged]);

  useEffect(() => {
    supabase.rpc("forum_touch").then(() => {
      loadStructure();
      loadUnread();
    });
  }, [supabase, loadStructure, loadUnread]);

  const go = (v: View) => {
    setView(v);
    setMenu(false);
  };
  const unreadIn = (sectionId: string) =>
    unread.filter((u) => u.section_id === sectionId).length;
  const unreadIds = new Set(unread.map((u) => u.thread_id));
  const sectionName = (id: string) =>
    sections.find((s) => s.id === id)?.name ?? "";

  const sidebar = (
    <nav aria-label="Sezioni del forum" className="space-y-2 p-3">
      <button
        type="button"
        onClick={() => go({ kind: "ultime" })}
        className={`w-full border px-3 py-2.5 text-center text-xs tracking-[0.2em] uppercase ${
          view.kind === "ultime"
            ? "border-accent text-accent"
            : "border-accent/50 text-[#d8c39a] hover:border-accent"
        }`}
      >
        Ultime discussioni
      </button>
      <button
        type="button"
        onClick={() => go({ kind: "leggi" })}
        className={`flex w-full items-center justify-center gap-2 border px-3 py-2 text-xs tracking-[0.2em] uppercase ${
          unread.length > 0
            ? "border-[#d4a72c]/70 bg-[#d4a72c]/10 text-[#f0c75e]"
            : "border-border text-muted"
        }`}
      >
        Leggi tutto
        {unread.length > 0 && (
          <span className="rounded-full bg-blood px-1.5 text-[0.65rem] font-bold text-white">
            {unread.length}
          </span>
        )}
      </button>
      {categories.map((c) => {
        const secs = sections.filter((s) => s.category_id === c.id);
        if (secs.length === 0 && !canManage) return null;
        const isOpen = open[c.id] ?? true;
        const news = secs.reduce((n, s) => n + unreadIn(s.id), 0);
        return (
          <div key={c.id}>
            <button
              type="button"
              onClick={() => setOpen((o) => ({ ...o, [c.id]: !isOpen }))}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between border-l-2 border-accent/70 bg-white/[0.03] px-3 py-2.5 text-left text-xs tracking-[0.16em] text-[#e8d8b4] uppercase hover:bg-white/[0.06]"
            >
              <span>
                {c.name}
                {news > 0 && !isOpen && (
                  <span className="ml-2 text-[#f0c75e]">•</span>
                )}
              </span>
              <span
                className={`text-accent transition ${isOpen ? "" : "-rotate-90"}`}
              >
                ▼
              </span>
            </button>
            {isOpen && (
              <ul className="mt-1 space-y-0.5 pl-3">
                {secs.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => go({ kind: "sezione", id: s.id })}
                      className={`flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm ${
                        view.kind === "sezione" && view.id === s.id
                          ? "bg-blood/20 text-accent"
                          : "text-muted hover:text-foreground"
                      }`}
                    >
                      <span className="min-w-0 truncate">
                        {s.name}
                        {s.visibility !== "tutti" && (
                          <span className="ml-1 text-[0.6rem] text-muted/70">
                            🔒
                          </span>
                        )}
                      </span>
                      {unreadIn(s.id) > 0 && (
                        <span className="shrink-0 text-xs text-[#f0c75e]">
                          {unreadIn(s.id)}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      {canManage && (
        <button
          type="button"
          onClick={() => go({ kind: "gestisci" })}
          className={`w-full border px-3 py-2 text-xs tracking-[0.16em] uppercase ${
            view.kind === "gestisci"
              ? "border-accent text-accent"
              : "border-dashed border-border text-muted hover:text-foreground"
          }`}
        >
          ⚙ Categorie e sezioni
        </button>
      )}
    </nav>
  );

  return (
    <div className="flex h-full flex-col md:flex-row">
      <div className="shrink-0 border-b border-border md:hidden">
        <button
          type="button"
          onClick={() => setMenu((m) => !m)}
          className="w-full px-4 py-2 text-left text-xs tracking-[0.16em] text-[#d8c39a] uppercase"
        >
          {menu ? "▲ Chiudi le sezioni" : "▼ Sezioni del forum"}
          {unread.length > 0 && (
            <span className="ml-2 text-[#f0c75e]">({unread.length} nuove)</span>
          )}
        </button>
        {menu && <div className="max-h-[50dvh] overflow-y-auto">{sidebar}</div>}
      </div>
      <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-border bg-black/40 md:block">
        {sidebar}
      </aside>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        {view.kind === "ultime" && (
          <ThreadList
            key={version}
            title="Forum On e Off"
            subtitle="Le ultime discussioni del reame."
            unreadIds={unreadIds}
            onOpen={(id) => go({ kind: "discussione", id })}
          />
        )}
        {view.kind === "sezione" && (
          <ThreadList
            key={`${view.id}-${version}`}
            sectionId={view.id}
            title={sectionName(view.id)}
            subtitle={sections.find((s) => s.id === view.id)?.description}
            unreadIds={unreadIds}
            onOpen={(id) => go({ kind: "discussione", id })}
            onNew={() => go({ kind: "nuova", sectionId: view.id })}
          />
        )}
        {view.kind === "discussione" && (
          <ForumThreadView
            key={view.id}
            threadId={view.id}
            userId={userId}
            canModerate={canModerate}
            sections={sections}
            onBack={(sectionId) =>
              go(
                sectionId
                  ? { kind: "sezione", id: sectionId }
                  : { kind: "ultime" },
              )
            }
            onChanged={changed}
          />
        )}
        {view.kind === "nuova" && (
          <NewThread
            sectionId={view.sectionId}
            sectionName={sectionName(view.sectionId)}
            onCancel={() => go({ kind: "sezione", id: view.sectionId })}
            onCreated={(id) => {
              changed();
              go({ kind: "discussione", id });
            }}
          />
        )}
        {view.kind === "leggi" && (
          <ReadAll
            key={version}
            unread={unread}
            onOpen={(id) => go({ kind: "discussione", id })}
            onRead={changed}
          />
        )}
        {view.kind === "gestisci" && canManage && (
          <ForumManage
            categories={categories}
            sections={sections}
            onChanged={() => {
              loadStructure();
              changed();
            }}
          />
        )}
      </div>
    </div>
  );
}

// Elenco delle discussioni: fissate in alto, poi dall'ultima risposta
function ThreadList({
  sectionId,
  title,
  subtitle,
  unreadIds,
  onOpen,
  onNew,
}: {
  sectionId?: string;
  title: string;
  subtitle?: string;
  unreadIds: Set<string>;
  onOpen: (id: string) => void;
  onNew?: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [threads, setThreads] = useState<ForumThread[] | null>(null);

  useEffect(() => {
    let q = supabase
      .from("forum_threads")
      .select(THREAD_SELECT)
      .order("pinned", { ascending: false })
      .order("last_post_at", { ascending: false });
    q = sectionId ? q.eq("section_id", sectionId) : q.limit(30);
    q.then(({ data }) => setThreads((data ?? []) as ForumThread[]));
  }, [supabase, sectionId]);

  return (
    <div className="p-5 sm:p-7">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-3xl tracking-wide text-accent">
            {title}
          </h2>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
        {onNew && (
          <button
            type="button"
            onClick={onNew}
            className="btn px-4 py-1.5 text-sm"
          >
            + Nuova discussione
          </button>
        )}
      </div>
      {threads === null ? (
        <p className="text-muted">Caricamento...</p>
      ) : threads.length === 0 ? (
        <p className="py-8 text-center text-muted">
          Ancora nessuna discussione.
        </p>
      ) : (
        <ul className="border-t border-border/60">
          {threads.map((t) => {
            const isNew = unreadIds.has(t.id);
            const replies = Math.max(0, (t.posts?.[0]?.count ?? 1) - 1);
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onOpen(t.id)}
                  className={`flex w-full items-center gap-3 border-b border-border/60 px-3 py-3 text-left transition hover:bg-white/[0.03] ${
                    t.important
                      ? "border-l-2 border-l-[#d4a72c] bg-blood/15"
                      : ""
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={`flex items-center gap-2 font-serif text-lg ${t.important ? "text-[#f0c75e]" : "text-[#f2e7c9]"}`}
                    >
                      {t.pinned && <PinIcon />}
                      {isNew && (
                        <span
                          className="h-2 w-2 shrink-0 rounded-full bg-[#f0c75e]"
                          title="Interventi nuovi"
                        />
                      )}
                      <span className="truncate">{t.title}</span>
                      {t.locked && (
                        <span className="shrink-0 text-xs text-muted">🔒</span>
                      )}
                    </span>
                    <span className="block text-xs text-muted">
                      {!sectionId && t.section?.name && (
                        <>in {t.section.name} · </>
                      )}
                      di {t.author_name} · {replies}{" "}
                      {replies === 1 ? "risposta" : "risposte"}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-muted">
                    {when(t.last_post_at)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Nuova discussione: titolo e primo intervento
function NewThread({
  sectionId,
  sectionName,
  onCancel,
  onCreated,
}: {
  sectionId: string;
  sectionName: string;
  onCancel: () => void;
  onCreated: (id: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function publish() {
    if (!title.trim()) return setError("Scrivi il titolo.");
    if (!stripped(body)) return setError("Scrivi il primo intervento.");
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc("forum_new_thread", {
      p_section: sectionId,
      p_title: title,
      p_body: body,
    });
    setBusy(false);
    if (error || !data) return setError("Discussione non pubblicata.");
    onCreated(data as string);
  }

  return (
    <div className="space-y-3 p-5 sm:p-7">
      <button
        type="button"
        onClick={onCancel}
        className="text-sm text-muted hover:text-accent"
      >
        ← {sectionName}
      </button>
      <h2 className="font-serif text-2xl text-accent">Nuova discussione</h2>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={120}
        placeholder="Titolo"
        aria-label="Titolo"
        className="input py-2"
      />
      <RichEditor value={body} onChange={setBody} textClassName="forum-text" />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={publish}
          className="btn px-5 py-1.5 text-sm"
        >
          {busy ? "Pubblicazione..." : "Pubblica"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="btn-ghost px-4 py-1.5 text-sm"
        >
          Annulla
        </button>
      </div>
    </div>
  );
}

// Leggi tutto: tutti gli interventi nuovi, discussione per discussione,
// uno sotto l'altro. Aperti qui, contano come letti
function ReadAll({
  unread,
  onOpen,
  onRead,
}: {
  unread: Unread[];
  onOpen: (id: string) => void;
  onRead: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [groups, setGroups] = useState<
    { thread: ForumThread; posts: ForumPost[] }[] | null
  >(() => (unread.length === 0 ? [] : null)); // niente di nuovo: subito vuoto

  useEffect(() => {
    if (unread.length === 0) return;
    const ids = unread.map((u) => u.thread_id);
    const since = unread.map((u) => u.since).sort()[0];
    Promise.all([
      supabase
        .from("forum_threads")
        .select(THREAD_SELECT)
        .in("id", ids)
        .order("last_post_at", { ascending: false }),
      supabase
        .from("forum_posts")
        .select("*, author:characters(avatar_url)")
        .in("thread_id", ids)
        .gt("created_at", since)
        .order("created_at"),
    ]).then(([t, p]) => {
      const posts = (p.data ?? []) as ForumPost[];
      const list = ((t.data ?? []) as ForumThread[]).map((thread) => {
        const from =
          unread.find((u) => u.thread_id === thread.id)?.since ?? since;
        return {
          thread,
          posts: posts.filter(
            (x) => x.thread_id === thread.id && x.created_at > from,
          ),
        };
      });
      setGroups(list);
    });
    // si legge una volta sola, all'apertura: poi tutto conta come letto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function markAll() {
    await supabase.rpc("forum_mark_read", { p_thread: null });
    onRead();
  }

  useEffect(() => {
    if (groups && groups.length > 0)
      supabase.rpc("forum_mark_read", { p_thread: null }).then(() => onRead());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);

  return (
    <div className="space-y-5 p-5 sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-3xl tracking-wide text-accent">
            Leggi tutto
          </h2>
          <p className="mt-1 text-sm text-muted">
            Tutti gli interventi nuovi, uno dopo l&apos;altro. Da qui contano
            come letti.
          </p>
        </div>
        {unread.length > 0 && (
          <button
            type="button"
            onClick={markAll}
            className="btn-ghost px-3 py-1.5 text-xs tracking-[0.12em] uppercase"
          >
            Segna tutto come letto
          </button>
        )}
      </div>
      {groups === null ? (
        <p className="text-muted">Caricamento...</p>
      ) : groups.length === 0 ? (
        <p className="py-8 text-center text-muted">
          Nessun intervento nuovo: sei in pari con il forum.
        </p>
      ) : (
        groups.map(({ thread, posts }) => (
          <section key={thread.id} className="space-y-2">
            <button
              type="button"
              onClick={() => onOpen(thread.id)}
              className="text-left font-serif text-xl text-[#f2e7c9] hover:text-accent"
            >
              {thread.title}
              <span className="ml-2 font-sans text-xs text-muted">
                in {thread.section?.name}
              </span>
            </button>
            {posts.map((p) => (
              <article
                key={p.id}
                className="border border-border/60 bg-black/30 p-3"
              >
                <p className="mb-2 border-b border-border/50 pb-1 text-xs text-muted">
                  <span className="font-serif text-sm text-accent">
                    {p.author_name}
                  </span>{" "}
                  · {when(p.created_at)}
                </p>
                <PostBody html={p.body} />
              </article>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
