"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Character, Message, MessageKind } from "@/lib/types";

type Props = {
  roomId: string;
  userId: string;
  isStaff: boolean;
  characters: Character[];
  initialMessages: Message[];
};

type PresenceState = { character: string };

export default function ChatRoom({ roomId, userId, isStaff, characters, initialMessages }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [characterId, setCharacterId] = useState(characters[0]?.id ?? "");
  const [kind, setKind] = useState<MessageKind>("azione");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [present, setPresent] = useState<string[]>([]);
  const [subscribed, setSubscribed] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const character = characters.find((c) => c.id === characterId);

  function addMessage(msg: Message) {
    setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
  }

  // Nuovi messaggi in tempo reale + presenze nella lista
  useEffect(() => {
    const channel = supabase.channel(`room:${roomId}`, {
      config: { presence: { key: userId } },
    });

    channel
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` },
        (payload) => addMessage(payload.new as Message),
      )
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresenceState>();
        const names = Object.values(state).flatMap((entries) => entries.map((e) => e.character));
        setPresent([...new Set(names)].sort());
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          channelRef.current = channel;
          setSubscribed(true);
        }
      });

    return () => {
      channelRef.current = null;
      setSubscribed(false);
      supabase.removeChannel(channel);
    };
  }, [supabase, roomId, userId]);

  // Annuncia con quale personaggio si e' presenti
  const characterName = character?.name;
  useEffect(() => {
    if (subscribed && characterName) channelRef.current?.track({ character: characterName });
  }, [subscribed, characterName]);

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
      setError(error.message);
      return;
    }
    addMessage(data);
    setText("");
  }

  if (characters.length === 0) {
    return (
      <div className="panel">
        <p>
          Per scrivere in una lista ti serve un personaggio.{" "}
          <Link href="/personaggi" className="text-accent underline">
            Creane uno
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-border bg-panel">
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && (
            <p className="text-center text-muted">La lista è silenziosa... inizia tu la giocata.</p>
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
              {isStaff && <option value="master">Narrazione master</option>}
            </select>
          </div>
          <div className="flex gap-2">
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
            <button className="btn self-end" disabled={sending || !text.trim()}>
              Invia
            </button>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </form>
      </div>

      <aside className="hidden w-52 shrink-0 md:block">
        <div className="panel">
          <h2 className="mb-2 font-serif text-accent">Presenti</h2>
          {present.length === 0 && <p className="text-sm text-muted">Nessuno</p>}
          <ul className="space-y-1 text-sm">
            {present.map((name) => (
              <li key={name}>• {name}</li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

function MessageRow({ message }: { message: Message }) {
  const time = new Date(message.created_at).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });

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
        <span className="text-xs">{time}</span> [OFF] <strong>{message.character_name}</strong>:{" "}
        {message.content}
      </p>
    );
  }

  return (
    <p className="leading-relaxed whitespace-pre-line">
      <span className="mr-2 text-xs text-muted">{time}</span>
      <strong className="font-serif text-accent">{message.character_name}</strong>{" "}
      <FormattedText text={message.content} />
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
          <span key={i} className="font-semibold text-orange-300">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
