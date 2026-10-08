"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { playEvent } from "@/lib/notify-sound";
import { createClient } from "@/lib/supabase/client";
import type { Character, Message, MessageKind } from "@/lib/types";
import DicePanel from "./DicePanel";

type Props = {
  roomId: string;
  canNarrate: boolean;
  characters: Character[];
  initialMessages: Message[];
};

export default function ChatRoom({
  roomId,
  canNarrate,
  characters,
  initialMessages,
}: Props) {
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
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diceOpen, setDiceOpen] = useState(false);
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const content = text.trim();
    if (!content || !characterId || sending) return;
    setSending(true);
    setError(null);
    const { data, error } = await supabase
      .from("messages")
      .insert({ room_id: roomId, character_id: characterId, kind, content })
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

  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-border bg-panel">
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
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

        <form
          className="space-y-2 border-t border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <div className="flex flex-wrap gap-2">
            <select
              value={characterId}
              onChange={(e) => setCharacterId(e.target.value)}
              className="input w-auto"
            >
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as MessageKind)}
              className="input w-auto"
            >
              <option value="azione">Azione</option>
              <option value="fuori_gioco">Fuori gioco (OFF)</option>
              {canNarrate && <option value="master">Narrazione master</option>}
            </select>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={3}
              maxLength={4000}
              placeholder='Descrivi le azioni del personaggio. Il parlato va tra «caporali» o "virgolette". Invio per inviare, Maiusc+Invio per andare a capo.'
              className="input flex-1 resize-none"
            />
            <div className="flex flex-col gap-2 self-end">
              <button
                type="button"
                onClick={() => setDiceOpen((o) => !o)}
                aria-pressed={diceOpen}
                className="btn-ghost px-3"
                title="Tira i dadi"
              >
                🎲 Dadi
              </button>
              <button className="btn" disabled={sending || !text.trim()}>
                Invia
              </button>
            </div>
          </div>
          {diceOpen && characterId && (
            <DicePanel
              roomId={roomId}
              characterId={characterId}
              canNarrate={canNarrate}
              onClose={() => setDiceOpen(false)}
            />
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
        </form>
      </div>
    </div>
  );
}

function MessageRow({ message }: { message: Message }) {
  const time = new Date(message.created_at).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });

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
          tira {message.content}
        </p>
      </div>
    );
  }

  if (message.kind === "master") {
    return (
      <div className="rounded-md border border-accent/40 bg-accent/10 px-4 py-3 text-center italic">
        <FormattedText text={message.content} />
        <div className="mt-1 text-xs text-muted not-italic">
          {time} · Master ({message.character_name})
        </div>
      </div>
    );
  }

  if (message.kind === "fuori_gioco") {
    return (
      <p className="text-sm text-muted">
        <span className="text-xs">{time}</span> [OFF]{" "}
        <strong>{message.character_name}</strong>: {message.content}
      </p>
    );
  }

  return (
    <p className="leading-relaxed whitespace-pre-line">
      <span className="mr-2 text-xs text-muted">{time}</span>
      <strong className="font-serif text-accent">
        {message.character_name}
      </strong>{" "}
      {/* colore dell'azione scelto nelle Opzioni della scheda */}
      <span style={{ color: "var(--chat-action, inherit)" }}>
        <FormattedText text={message.content} />
      </span>
    </p>
  );
}

// Evidenzia il parlato scritto tra «caporali» o "virgolette"
function FormattedText({ text }: { text: string }) {
  // Con il gruppo di cattura, le parti tra virgolette finiscono agli indici dispari
  const parts = text.split(/(«[^»]*»|"[^"]*"|“[^”]*”)/g);
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
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
