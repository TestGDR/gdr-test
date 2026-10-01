"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Modal from "@/components/ui/Modal";
import { normalizeCharacterName, validateCharacterName } from "@/lib/character-name";
import type { MainCharacter } from "@/lib/main-character";
import { createClient } from "@/lib/supabase/client";

export type MessageKind = "missiva" | "off";
export type Contact = { id: string; name: string; avatar?: string | null };

type PrivateMessage = {
  id: number;
  kind: MessageKind;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
  sender: { name: string; avatar_url: string | null } | null;
  recipient: { name: string; avatar_url: string | null } | null;
};

const SELECT = `id, kind, sender_id, recipient_id, body, created_at, read_at,
  sender:characters!private_messages_sender_id_fkey(name, avatar_url),
  recipient:characters!private_messages_recipient_id_fkey(name, avatar_url)`;

export const KIND_LABEL: Record<MessageKind, string> = { missiva: "Missive", off: "Messaggi OFF" };

type Props = {
  kind: MessageKind;
  open: boolean;
  onClose: () => void;
  me: MainCharacter;
  initialTo: Contact | null;
  session: number; // cambia a ogni apertura: riparte da zero con i dati aggiornati
  onRead: () => void;
};

export default function MessagesModal({ kind, open, onClose, me, initialTo, session, onRead }: Props) {
  return (
    <Modal open={open} onClose={onClose} title={KIND_LABEL[kind]} size="xl">
      {open && (
        <Messages key={session} kind={kind} me={me} initialTo={initialTo} onRead={onRead} />
      )}
    </Modal>
  );
}

function Messages({
  kind,
  me,
  initialTo,
  onRead,
}: Pick<Props, "kind" | "me" | "initialTo" | "onRead">) {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<PrivateMessage[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(initialTo?.id ?? null);
  // Contatti senza ancora messaggi (nuova conversazione)
  const [extra, setExtra] = useState<Contact[]>(initialTo ? [initialTo] : []);
  const [lookup, setLookup] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const canWrite = kind === "off" || me.status === "attivo";

  // Storico (ultimi 500 messaggi di questo tipo)
  useEffect(() => {
    supabase
      .from("private_messages")
      .select(SELECT)
      .eq("kind", kind)
      .or(`sender_id.eq.${me.id},recipient_id.eq.${me.id}`)
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data }) => setMessages(((data ?? []) as unknown as PrivateMessage[]).reverse()));
  }, [supabase, kind, me.id]);

  // Nuovi messaggi ricevuti in tempo reale
  useEffect(() => {
    const ch = supabase
      .channel(`pm:${me.id}:${kind}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "private_messages", filter: `recipient_id=eq.${me.id}` },
        async (payload) => {
          if ((payload.new as PrivateMessage).kind !== kind) return;
          const { data } = await supabase
            .from("private_messages")
            .select(SELECT)
            .eq("id", (payload.new as PrivateMessage).id)
            .single();
          if (data) {
            const msg = data as unknown as PrivateMessage;
            setMessages((prev) => (prev?.some((m) => m.id === msg.id) ? prev : [...(prev ?? []), msg]));
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, kind, me.id]);

  // Conversazioni: una per ogni personaggio con cui ho scambiato messaggi
  const conversations = useMemo(() => {
    const map = new Map<string, Contact & { last?: PrivateMessage; unread: number }>();
    for (const c of extra) map.set(c.id, { ...c, unread: 0 });
    for (const m of messages ?? []) {
      const mine = m.sender_id === me.id;
      const otherId = mine ? m.recipient_id : m.sender_id;
      const other = mine ? m.recipient : m.sender;
      const entry = map.get(otherId) ?? { id: otherId, name: other?.name ?? "?", avatar: other?.avatar_url, unread: 0 };
      entry.last = m;
      if (!mine && !m.read_at) entry.unread++;
      map.set(otherId, entry);
    }
    return [...map.values()].sort(
      (a, b) => (b.last?.created_at ?? "9").localeCompare(a.last?.created_at ?? "9"),
    );
  }, [messages, extra, me.id]);

  const active = conversations.find((c) => c.id === activeId) ?? null;
  const thread = useMemo(
    () =>
      (messages ?? []).filter(
        (m) =>
          (m.sender_id === activeId && m.recipient_id === me.id) ||
          (m.sender_id === me.id && m.recipient_id === activeId),
      ),
    [messages, activeId, me.id],
  );

  // Aprendo una conversazione i messaggi ricevuti diventano "letti"
  const unreadInThread = thread.filter((m) => m.recipient_id === me.id && !m.read_at).length;
  useEffect(() => {
    if (!activeId || unreadInThread === 0) return;
    const now = new Date().toISOString();
    supabase
      .from("private_messages")
      .update({ read_at: now })
      .eq("kind", kind)
      .eq("recipient_id", me.id)
      .eq("sender_id", activeId)
      .is("read_at", null)
      .then(() => {
        setMessages((prev) =>
          (prev ?? []).map((m) =>
            m.sender_id === activeId && m.recipient_id === me.id && !m.read_at ? { ...m, read_at: now } : m,
          ),
        );
        onRead();
      });
  }, [supabase, kind, me.id, activeId, unreadInThread, onRead]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [thread.length, activeId]);

  async function openByName(e: FormEvent) {
    e.preventDefault();
    const name = normalizeCharacterName(lookup);
    if (validateCharacterName(name)) return setLookupError("Nome non valido.");
    const { data } = await supabase
      .from("characters")
      .select("id, name, avatar_url")
      .ilike("name", name)
      .maybeSingle();
    if (!data) return setLookupError("Nessun personaggio con questo nome.");
    if (data.id === me.id) return setLookupError("Non puoi scrivere a te stesso.");
    setExtra((prev) => (prev.some((c) => c.id === data.id) ? prev : [...prev, { id: data.id, name: data.name, avatar: data.avatar_url }]));
    setActiveId(data.id);
    setLookup("");
    setLookupError(null);
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || !activeId || sending) return;
    setSending(true);
    setSendError(null);
    const { data, error } = await supabase
      .from("private_messages")
      .insert({ kind, sender_id: me.id, recipient_id: activeId, body })
      .select(SELECT)
      .single();
    setSending(false);
    if (error) return setSendError("Invio non riuscito.");
    setMessages((prev) => [...(prev ?? []), data as unknown as PrivateMessage]);
    setText("");
  }

  const missiva = kind === "missiva";

  return (
    <div className="flex h-full">
      {/* Conversazioni */}
      <aside
        className={`w-full flex-col border-border md:flex md:w-72 md:shrink-0 md:border-r ${
          activeId ? "hidden" : "flex"
        }`}
      >
        <form onSubmit={openByName} className="border-b border-border p-3">
          <label className="mb-1 block text-xs tracking-wider text-muted uppercase">
            {missiva ? "Nuova missiva a" : "Nuovo messaggio a"}
          </label>
          <div className="flex gap-2">
            <input
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
              placeholder="Nome del personaggio"
              className="input py-1.5 text-sm"
            />
            <button className="btn px-3 py-1.5 text-sm">Apri</button>
          </div>
          {lookupError && <p className="mt-1 text-xs text-red-400">{lookupError}</p>}
        </form>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {messages === null && <li className="p-3 text-sm text-muted">Caricamento...</li>}
          {messages !== null && conversations.length === 0 && (
            <li className="p-3 text-sm text-muted">Nessuna conversazione.</li>
          )}
          {conversations.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setActiveId(c.id)}
                className={`flex w-full items-center gap-3 border-b border-border/60 px-3 py-2.5 text-left transition hover:bg-blood/15 ${
                  c.id === activeId ? "bg-blood/25" : ""
                }`}
              >
                <Avatar name={c.name} url={c.avatar} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-serif text-accent">{c.name}</span>
                  <span className="block truncate text-xs text-muted">{c.last?.body ?? "Nuova conversazione"}</span>
                </span>
                {c.unread > 0 && (
                  <span className="rounded-full bg-blood px-1.5 text-xs font-bold text-white">{c.unread}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Conversazione aperta */}
      <section className={`min-w-0 flex-1 flex-col ${activeId ? "flex" : "hidden md:flex"}`}>
        {!active ? (
          <p className="m-auto p-6 text-center text-muted">
            Scegli una conversazione o scrivi il nome di un personaggio.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <button
                type="button"
                onClick={() => setActiveId(null)}
                className="text-muted hover:text-accent md:hidden"
                aria-label="Torna alle conversazioni"
              >
                ←
              </button>
              <Avatar name={active.name} url={active.avatar} />
              <h3 className="font-serif text-lg text-accent">{active.name}</h3>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {thread.length === 0 && <p className="text-center text-sm text-muted">Nessun messaggio.</p>}
              {thread.map((m) => {
                const mine = m.sender_id === me.id;
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-lg border px-4 py-2 ${
                        missiva
                          ? "border-accent/40 bg-[#1e1712] font-serif italic"
                          : mine
                            ? "border-blood/50 bg-blood/20"
                            : "border-border bg-background"
                      }`}
                    >
                      {missiva && (
                        <p className="mb-1 text-xs text-muted not-italic">
                          {mine ? `A ${active.name}` : `Da ${active.name}`}
                        </p>
                      )}
                      <p className="text-sm whitespace-pre-line">{m.body}</p>
                      <p className="mt-1 text-right text-[10px] text-muted not-italic">
                        {new Date(m.created_at).toLocaleString("it-IT", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {canWrite ? (
              <form onSubmit={send} className="flex gap-2 border-t border-border p-3">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(e);
                    }
                  }}
                  rows={2}
                  maxLength={4000}
                  placeholder={missiva ? "Scrivi la tua missiva..." : "Scrivi un messaggio fuori gioco..."}
                  className="input flex-1 resize-none"
                />
                <button className="btn self-end" disabled={sending || !text.trim()}>
                  Invia
                </button>
              </form>
            ) : (
              <p className="border-t border-border p-3 text-sm text-orange-200">
                Le missive sono messaggi in gioco: potrai scriverle quando il tuo personaggio sarà attivo.
              </p>
            )}
            {sendError && <p className="px-3 pb-2 text-sm text-red-400">{sendError}</p>}
          </>
        )}
      </section>
    </div>
  );
}

export function Avatar({ name, url, size = "h-9 w-9" }: { name: string; url?: string | null; size?: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className={`${size} shrink-0 rounded object-cover`} />
  ) : (
    <span
      className={`${size} flex shrink-0 items-center justify-center rounded border border-blood/60 bg-background font-serif text-accent`}
    >
      {name[0]}
    </span>
  );
}
