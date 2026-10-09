"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Modal from "@/components/ui/Modal";
import { isFresh } from "@/lib/chat-ttl";
import { playEvent } from "@/lib/notify-sound";
import { createClient } from "@/lib/supabase/client";
import type { Character, Message, MessageKind } from "@/lib/types";
import { combatAlerts } from "../combat-actions";
import ChatCommands, { type CommandTab } from "./ChatCommands";
import { ChatNotepad, ChatSave, type RoomInfo } from "./ChatTools";

type Props = {
  room: RoomInfo;
  canNarrate: boolean;
  characters: Character[];
  initialMessages: Message[];
};

const MAX_LEN = 1200;
type Tool = "comandi" | "notepad" | "salva";

export default function ChatRoom({
  room,
  canNarrate,
  characters,
  initialMessages,
}: Props) {
  const roomId = room.id;
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  // Dopo "Aggiorna" arrivano dal server i messaggi aggiornati: li unisco a quelli
  // gia' mostrati (senza ricreare la chat, cosi' il testo che si sta scrivendo resta)
  const [lastInitial, setLastInitial] = useState(initialMessages);
  if (initialMessages !== lastInitial) {
    setLastInitial(initialMessages);
    setMessages((prev) => {
      const byId = new Map([...prev, ...initialMessages].map((m) => [m.id, m]));
      return [...byId.values()].sort((a, b) =>
        a.created_at.localeCompare(b.created_at),
      );
    });
  }
  const [characterId, setCharacterId] = useState(characters[0]?.id ?? "");
  const [kind, setKind] = useState<MessageKind>("azione");
  const [recipient, setRecipient] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool | null>(null);
  const [cmdTab, setCmdTab] = useState<CommandTab>("abilita");
  const [alerts, setAlerts] = useState<{ attackers: string[]; dying: boolean }>(
    { attackers: [], dying: false },
  );
  const bottomRef = useRef<HTMLDivElement>(null);

  function addMessage(msg: Message) {
    setMessages((prev) =>
      prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
    );
  }

  // Nuovi messaggi in tempo reale (chi e' presente lo mostra la colonna sinistra).
  // Quelli degli altri suonano col suono scelto per la chat (Opzioni della scheda)
  const mine = useMemo(
    () => new Set(characters.map((c) => c.id)),
    [characters],
  );
  useEffect(() => {
    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          if (!mine.has(msg.character_id)) playEvent("chat");
          addMessage(msg);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, roomId, mine]);

  // Dopo un'ora dall'invio l'azione sparisce dalla chat (resta nel database)
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setMessages((prev) =>
        prev.every((m) => isFresh(m.created_at, now))
          ? prev
          : prev.filter((m) => isFresh(m.created_at, now)),
      );
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Avvisi di combattimento (attacchi da cui difendersi, tiro salvezza):
  // si ricontrollano a ogni nuovo tiro in chat
  const diceKey = messages
    .filter((m) => m.kind === "dado")
    .map((m) => m.id)
    .slice(-1)[0];
  useEffect(() => {
    if (!characterId) return;
    combatAlerts(roomId, characterId).then(setAlerts);
  }, [roomId, characterId, diceKey]);

  // PG che hanno giocato in questa chat (per destinatario e Raggira)
  const others = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of messages)
      if (!mine.has(m.character_id) && m.character_name)
        map.set(m.character_id, m.character_name);
    return [...map]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [messages, mine]);

  async function send() {
    const content = text.trim();
    if (!content || !characterId || sending) return;
    setSending(true);
    setError(null);
    const { data, error } = await supabase
      .from("messages")
      .insert({
        room_id: roomId,
        character_id: characterId,
        kind,
        content,
        recipient: recipient.trim() || null,
      })
      .select()
      .single<Message>();
    setSending(false);
    if (error) {
      // Regole del database: chat privata senza accesso (affitto scaduto, espulsione...)
      setError(
        error.code === "42501"
          ? "Non puoi scrivere in questa chat: non hai (più) accesso."
          : error.message,
      );
      return;
    }
    addMessage(data);
    setText("");
  }

  const tools: { id: Tool; label: string; icon: ReactNode }[] = [
    {
      id: "comandi",
      label: "Comandi",
      icon: (
        <path d="M4 7l6-3 6 3v7l-6 3-6-3zM10 4v13M4 7l6 3 6-3M16 11l4 2v5l-4 2-4-2" />
      ),
    },
    {
      id: "notepad",
      label: "Notepad",
      icon: <path d="M5 4h10l4 4v12H5zM8 10h8M8 14h5M14 19l5-5 2 2-5 5h-2z" />,
    },
    {
      id: "salva",
      label: "Salva",
      icon: <path d="M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6" />,
    },
  ];
  const titles: Record<Tool, string> = {
    comandi: "Comandi",
    notepad: "Notepad",
    salva: "Salva la chat",
  };

  const left = MAX_LEN - text.length;
  const lbl =
    "w-24 shrink-0 text-[0.65rem] font-semibold tracking-[0.14em] text-[#c97a7a] uppercase";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-lg border border-border bg-panel p-4">
        {messages.length === 0 && (
          <p className="text-center text-muted">
            La lista è silenziosa... inizia tu la giocata.
          </p>
        )}
        {messages.map((m) => (
          <MessageRow key={m.id} message={m} />
        ))}
        <div ref={bottomRef} />
      </div>

      {(alerts.attackers.length > 0 || alerts.dying) && (
        <button
          type="button"
          onClick={() => {
            setCmdTab("combattimento");
            setTool("comandi");
          }}
          className="flex w-full items-center justify-center gap-2 border border-red-800/70 bg-red-950/40 px-3 py-1.5 text-sm text-red-200 hover:bg-red-950/60"
        >
          ⚔{" "}
          {alerts.dying
            ? "Sei morente: fai il tiro salvezza prima della tua azione"
            : `Sei attaccato da ${alerts.attackers.join(", ")}: scrivi la tua azione e difenditi`}
        </button>
      )}

      {/* Barra dei comandi: ognuno apre una finestra */}
      <nav
        aria-label="Strumenti della chat"
        className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 py-1"
      >
        {tools.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setCmdTab("abilita");
              setTool(t.id);
            }}
            className="flex items-center gap-1.5 text-[0.7rem] font-semibold tracking-[0.18em] text-[#c97a7a] uppercase transition hover:text-[#f0a0a0]"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
              aria-hidden
            >
              {t.icon}
            </svg>
            {t.label}
          </button>
        ))}
      </nav>

      {/* Riquadro di scrittura */}
      <form
        className="grid gap-2 border border-border bg-black/70 p-2 md:grid-cols-[17rem_1fr_6rem]"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div className="space-y-1.5">
          {characters.length > 1 && (
            <label className="flex items-center gap-2">
              <span className={lbl}>Personaggio</span>
              <select
                value={characterId}
                onChange={(e) => setCharacterId(e.target.value)}
                className="input py-0.5 text-xs"
              >
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex items-center gap-2">
            <span className={lbl}>Destinatario</span>
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              list={`dest-${roomId}`}
              maxLength={60}
              placeholder="Tag libero / PG"
              className="input py-0.5 text-xs"
            />
            <datalist id={`dest-${roomId}`}>
              {others.map((o) => (
                <option key={o.id} value={o.name} />
              ))}
            </datalist>
          </label>
          <label className="flex items-center gap-2">
            <span className={lbl}>Tipo</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as MessageKind)}
              className="input py-0.5 text-xs"
            >
              <option value="azione">Parlato / Azione</option>
              <option value="fuori_gioco">Fuori gioco (OFF)</option>
              {canNarrate && <option value="master">Narrazione master</option>}
            </select>
          </label>
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <div className="relative flex-1">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={3}
              maxLength={MAX_LEN}
              placeholder="Scrivi qui la tua azione..."
              className="input h-full min-h-20 resize-none pr-14 text-sm"
            />
            <span
              className={`absolute top-1.5 right-2 border border-border px-1.5 text-[0.65rem] ${left < 100 ? "text-red-400" : "text-muted"}`}
            >
              {left}
            </span>
          </div>
          <p className="text-[0.7rem] text-[#c97a7a]">
            Inserire il parlato tra &lt; &gt;, il descritto fuori. Massimo{" "}
            {MAX_LEN} caratteri. Invio per inviare, Maiusc+Invio per andare a
            capo.
          </p>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <button
          className="border border-border bg-gradient-to-b from-[#2a2626] to-[#141212] font-serif text-sm tracking-[0.18em] text-foreground uppercase transition hover:border-accent hover:text-accent disabled:opacity-50 max-md:py-2"
          disabled={sending || !text.trim()}
        >
          {sending ? "..." : "Invia"}
        </button>
      </form>

      <Modal
        open={tool !== null}
        onClose={() => setTool(null)}
        title={tool ? titles[tool] : ""}
        size="lg"
      >
        {tool === "comandi" &&
          (characterId ? (
            <ChatCommands
              roomId={roomId}
              characterId={characterId}
              canNarrate={canNarrate}
              others={others}
              initialTab={cmdTab}
              onDone={() => {
                setTool(null);
                combatAlerts(roomId, characterId).then(setAlerts);
              }}
            />
          ) : (
            <p className="text-muted">Serve un personaggio attivo.</p>
          ))}
        {tool === "notepad" && <ChatNotepad characterId={characterId} />}
        {tool === "salva" && <ChatSave room={room} messages={messages} />}
      </Modal>
    </div>
  );
}

function MessageRow({ message }: { message: Message }) {
  const time = new Date(message.created_at).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const to = message.recipient ? (
    <span className="text-muted"> → {message.recipient}</span>
  ) : null;

  if (message.kind === "dado") {
    return (
      <div className="flex items-start gap-2 rounded-md border border-[#c9a45c]/40 bg-[#c9a45c]/10 px-3 py-2 text-sm">
        <span aria-hidden className="text-lg leading-none">
          🎲
        </span>
        <p className="min-w-0 flex-1">
          <span className="mr-2 text-xs text-muted">{time}</span>
          <strong className="font-serif text-accent">
            {message.character_name}
          </strong>{" "}
          {/* i tiri vecchi non avevano il verbo nel testo */}
          {(message.roll_data as { verb?: boolean } | null)?.verb ||
          /^(tira|effettua|attacca) /.test(message.content)
            ? ""
            : "tira "}
          {message.content}
        </p>
      </div>
    );
  }

  if (message.kind === "master") {
    return (
      <div className="rounded-md border border-accent/40 bg-accent/10 px-4 py-3 text-center italic">
        <FormattedText text={message.content} />
        <div className="mt-1 text-xs text-muted not-italic">
          {time} · Master ({message.character_name}){to}
        </div>
      </div>
    );
  }

  if (message.kind === "fuori_gioco") {
    return (
      <p className="text-sm text-muted">
        <span className="text-xs">{time}</span> [OFF]{" "}
        <strong>{message.character_name}</strong>
        {to}: {message.content}
      </p>
    );
  }

  return (
    <p className="leading-relaxed whitespace-pre-line">
      <span className="mr-2 text-xs text-muted">{time}</span>
      <strong className="font-serif text-accent">
        {message.character_name}
      </strong>
      {to} {/* colore dell'azione scelto nelle Opzioni della scheda */}
      <span style={{ color: "var(--chat-action, inherit)" }}>
        <FormattedText text={message.content} />
      </span>
    </p>
  );
}

// Evidenzia il parlato scritto tra < >, «caporali» o "virgolette"
function FormattedText({ text }: { text: string }) {
  // Con il gruppo di cattura, le parti tra virgolette finiscono agli indici dispari
  const parts = text.split(/(<[^>]*>|«[^»]*»|"[^"]*"|“[^”]*”)/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          // colore del parlato scelto nelle Opzioni della scheda
          <span
            key={i}
            className="font-semibold"
            style={{ color: "var(--chat-speech, #fde68a)" }}
          >
            {part.startsWith("<") ? `«${part.slice(1, -1)}»` : part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
