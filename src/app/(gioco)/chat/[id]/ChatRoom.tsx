"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import { isFresh } from "@/lib/chat-ttl";
import { playEvent } from "@/lib/notify-sound";
import { createClient } from "@/lib/supabase/client";
import type { Character, Message, MessageKind } from "@/lib/types";
import { combatAlerts } from "../combat-actions";
import { joinChat, leaveChat } from "../presence-actions";
import ChatCommands, { type CommandTab } from "./ChatCommands";
import { ChatNotepad, ChatSave, type RoomInfo } from "./ChatTools";

type Props = {
  room: RoomInfo;
  canNarrate: boolean;
  characters: Character[];
  initialMessages: Message[];
  maxLen: number; // limite di caratteri di un'azione (Gestione -> Chat)
  presence: Present[]; // personaggi in giocata
  npcs: { id: string; name: string }[]; // PNG che l'utente puo' muovere (vuoto per i giocatori)
  canNpc: boolean; // l'utente ha il permesso di muovere i PNG
  hiddenCount: number; // azioni che chi non e' entrato vede sfocate
  canSeeAll: boolean; // staff: legge la chat anche senza entrare
  invisible: boolean; // staff invisibile: gioca senza entrare in giocata
  // giocate in corso in altre chat (da cui non si e' ancora usciti)
  elsewhere: { characterId: string; roomId: string; roomName: string }[];
};
type Present = { id: string; name: string; isNpc?: boolean };

type Tool = "comandi" | "notepad" | "salva" | "tipo";
const KIND_LABEL: Partial<Record<MessageKind, string>> = {
  azione: "Parlato / Azione",
  fuori_gioco: "Fuori gioco (OFF)",
  master: "Narrazione master",
};

export default function ChatRoom({
  room,
  canNarrate,
  characters,
  initialMessages,
  maxLen: MAX_LEN,
  presence,
  npcs,
  canNpc,
  hiddenCount,
  canSeeAll,
  invisible,
  elsewhere,
}: Props) {
  const roomId = room.id;
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  // Presenti in chat: si aggiornano in tempo reale (e ogni minuto, per chi
  // esce da solo dopo un'ora senza scrivere)
  const [present, setPresent] = useState<Present[]>(presence);
  const [hidden, setHidden] = useState(hiddenCount);
  const [entering, setEntering] = useState(false);
  const loadPresence = useCallback(async () => {
    const [{ data }, { data: n }] = await Promise.all([
      supabase.rpc("chat_present", { p_room: roomId }),
      supabase.rpc("chat_hidden_count", { p_room: roomId }),
    ]);
    if (data)
      setPresent(
        (data as { character_id: string; name: string; is_npc: boolean }[]).map(
          (p) => ({ id: p.character_id, name: p.name, isNpc: p.is_npc }),
        ),
      );
    setHidden((n as number | null) ?? 0);
  }, [supabase, roomId]);
  useEffect(() => {
    const channel = supabase
      .channel(`presenti:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_presence" },
        () => loadPresence(),
      )
      .subscribe();
    const t = setInterval(loadPresence, 60_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(t);
    };
  }, [supabase, roomId, loadPresence]);
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
  const [alerts, setAlerts] = useState<
    { id: string; attackers: string[]; dying: boolean }[]
  >([]);
  const listRef = useRef<HTMLDivElement>(null);
  // si scende da soli ai messaggi nuovi solo se si e' gia' in fondo;
  // altrimenti compare "N nuovi messaggi"
  const atBottom = useRef(true);
  const [unseen, setUnseen] = useState(0);

  const scrollToEnd = useCallback((smooth = true) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    atBottom.current = true;
    setUnseen(0);
  }, []);

  function addMessage(msg: Message, own = false) {
    setMessages((prev) =>
      prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
    );
    if (own) atBottom.current = true;
    else if (!atBottom.current) setUnseen((n) => n + 1);
  }

  // Nuovi messaggi in tempo reale (chi e' presente lo mostra la colonna sinistra).
  // Quelli degli altri suonano col suono scelto per la chat (Opzioni della scheda)
  // i miei personaggi: i PG dell'utente e, per chi li gestisce, i PNG
  const ownIds = useMemo(
    () => new Set(characters.map((c) => c.id)),
    [characters],
  );
  const mine = useMemo(
    () => new Set([...characters.map((c) => c.id), ...npcs.map((n) => n.id)]),
    [characters, npcs],
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
          const own = mine.has(msg.character_id);
          if (!own) playEvent("chat");
          addMessage(msg, own);
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
    if (atBottom.current) scrollToEnd();
  }, [messages, scrollToEnd]);

  // Avvisi di combattimento (attacchi da cui difendersi, tiro salvezza):
  // si ricontrollano a ogni nuovo tiro in chat
  const diceKey = messages
    .filter((m) => m.kind === "dado")
    .map((m) => m.id)
    .slice(-1)[0];
  // Immagine e stemma della casata di chi ha scritto, per le schede delle azioni
  const [cast, setCast] = useState<Record<string, Who>>({});
  const writerKey = [...new Set(messages.map((m) => m.character_id))]
    .sort()
    .join(",");
  useEffect(() => {
    const ids = writerKey ? writerKey.split(",") : [];
    if (!ids.length) return;
    supabase
      .from("characters")
      .select("id, avatar_url, house:houses(name, sigil_url)")
      .in("id", ids)
      .then(({ data }) =>
        setCast(
          Object.fromEntries(
            (
              (data ?? []) as unknown as {
                id: string;
                avatar_url: string | null;
                house: { name: string; sigil_url: string | null } | null;
              }[]
            ).map((c) => [
              c.id,
              {
                avatar: c.avatar_url,
                sigil: c.house?.sigil_url ?? null,
                house: c.house?.name ?? null,
              },
            ]),
          ),
        ),
      );
  }, [supabase, writerKey]);

  // Con chi posso scrivere adesso: i miei personaggi in giocata (PG e PNG);
  // da invisibili anche i propri PG senza essere entrati
  const actors = useMemo(() => {
    const list = present.filter((p) => mine.has(p.id));
    if (invisible)
      for (const c of characters)
        if (!list.some((p) => p.id === c.id))
          list.push({ id: c.id, name: c.name });
    return list;
  }, [present, mine, invisible, characters]);
  const actorId = actors.some((a) => a.id === characterId)
    ? characterId
    : (actors[0]?.id ?? characterId);
  const actorKey = actors.map((a) => a.id).join(",");
  useEffect(() => {
    const ids = actorKey ? actorKey.split(",") : [];
    if (!ids.length) return;
    // avvisi per tutti i personaggi che muovo (un master puo' avere piu' PNG)
    Promise.all(
      ids.map((id) => combatAlerts(roomId, id).then((r) => ({ id, ...r }))),
    ).then(setAlerts);
  }, [roomId, actorKey, diceKey]);

  // Gli altri personaggi in giocata (per destinatario, Raggira e combattimento)
  const others = useMemo(
    () =>
      present
        .filter((p) => p.id !== actorId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [present, actorId],
  );
  const ownPresent = present.find((p) => ownIds.has(p.id));
  // da invisibili si gioca senza entrare (e senza comparire tra i presenti)
  const joined = actors.length > 0;
  const myPresent = ownPresent;
  // PNG da portare in giocata e da togliere (solo per chi li gestisce)
  async function addNpc(id: string) {
    setError(null);
    const res = await joinChat(roomId, id);
    if (res.error) return setError(res.error);
    router.refresh();
  }
  async function removeNpc(id: string) {
    await leaveChat(roomId, id);
    router.refresh();
  }

  async function enter() {
    setEntering(true);
    setError(null);
    const res = await joinChat(roomId, characterId);
    if (res.error) {
      setEntering(false);
      setError(res.error);
      return;
    }
    router.refresh(); // ricarica la chat con le azioni da leggere
  }
  async function exit() {
    if (!myPresent) return;
    setEntering(true);
    await leaveChat(roomId, myPresent.id);
    router.refresh();
  }

  // content: testo da mandare (di base quello della barra di scrittura)
  async function send(content = text.trim()): Promise<boolean> {
    if (!content || !actorId || sending) return false;
    setSending(true);
    setError(null);
    const { data, error } = await supabase
      .from("messages")
      .insert({
        room_id: roomId,
        character_id: actorId,
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
      return false;
    }
    addMessage(data, true);
    setText("");
    return true;
  }

  function openTool(t: Tool) {
    setCmdTab("abilita");
    setTool(t);
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
    tipo: "Destinatario",
  };

  const left = MAX_LEN - text.length;
  const lbl =
    "w-24 shrink-0 text-[0.65rem] font-semibold tracking-[0.14em] text-[#c97a7a] uppercase";
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const characterSelect = actors.length > 1 && (
    <label className="flex items-center gap-2">
      <span className={lbl}>Personaggio</span>
      <select
        value={actorId}
        onChange={(e) => setCharacterId(e.target.value)}
        className="input py-0.5 text-xs"
      >
        {actors.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.isNpc ? " (PNG)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
  const recipientInput = (
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
  );
  const kindSelect = (
    <label className="flex items-center gap-2">
      <span className={lbl}>Tipo</span>
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value as MessageKind)}
        className="input py-0.5 text-xs"
      >
        <option value="azione">{KIND_LABEL.azione}</option>
        <option value="fuori_gioco">{KIND_LABEL.fuori_gioco}</option>
        {canNarrate && <option value="master">{KIND_LABEL.master}</option>}
      </select>
    </label>
  );

  const blurred = !joined && !canSeeAll;
  // primo avviso di combattimento tra i personaggi che muovo
  const alert = alerts.find((a) => a.attackers.length > 0 || a.dying) ?? null;
  const alertWho =
    alert && actors.length > 1
      ? `${actors.find((a) => a.id === alert.id)?.name ?? ""} è `
      : "Sei ";
  // il personaggio scelto sta ancora giocando in un'altra chat
  const busyIn = elsewhere.find((e) => e.characterId === characterId) ?? null;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 max-lg:gap-0">
      <PresenceBar
        present={present}
        mine={mine}
        joined={!!ownPresent}
        busy={entering}
        onExit={exit}
        npcs={npcs.filter((n) => !present.some((p) => p.id === n.id))}
        canNpc={canNpc}
        onAddNpc={addNpc}
        onRemoveNpc={removeNpc}
      />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={listRef}
          data-chat-scroll
          onScroll={(e) => {
            const el = e.currentTarget;
            atBottom.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 40;
            if (atBottom.current) setUnseen(0);
          }}
          className="min-h-0 flex-1 overflow-y-auto px-1 py-2 lg:space-y-3 max-lg:px-3 max-lg:py-1"
        >
          {blurred ? (
            // chi non e' in giocata vede le azioni sfocate (senza testo: righe finte)
            <BlurredRows count={hidden} />
          ) : (
            <>
              {messages.length === 0 && (
                <p className="py-6 text-center text-muted">
                  La lista è silenziosa... inizia tu la giocata.
                </p>
              )}
              {messages.map((m) => (
                <MessageRow key={m.id} message={m} who={cast[m.character_id]} />
              ))}
            </>
          )}
        </div>
        {!joined && (
          <div
            className={`absolute inset-x-0 flex justify-center px-4 ${blurred ? "top-1/2 -translate-y-1/2" : "top-3"}`}
          >
            <div className="w-full max-w-sm space-y-3 border border-accent/50 bg-black/90 p-5 text-center shadow-2xl shadow-black">
              <p className="font-serif text-lg text-accent">
                Non fai ancora parte della giocata
              </p>
              <p className="text-sm text-muted">
                {characters.length === 0
                  ? "Non hai un personaggio tuo: porta in giocata un PNG dal menu «+ PNG» nella barra qui sopra."
                  : hidden > 0
                    ? "Qui si sta giocando: entra per leggere le azioni e partecipare."
                    : "Entra per iniziare a giocare in questa chat."}
              </p>
              {busyIn && (
                <p className="border border-[#f0c75e]/50 bg-[#f0c75e]/10 px-3 py-2 text-sm text-[#f0c75e]">
                  Hai una giocata in corso in{" "}
                  <Link
                    href={`/chat/${busyIn.roomId}`}
                    className="font-semibold underline hover:text-accent"
                  >
                    {busyIn.roomName}
                  </Link>
                  : per entrare qui devi prima concluderla con &quot;Esci dalla
                  chat&quot;.
                </p>
              )}
              {characters.length > 1 && (
                <select
                  value={characterId}
                  onChange={(e) => setCharacterId(e.target.value)}
                  className="input py-1 text-sm"
                  aria-label="Personaggio"
                >
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              {characters.length > 0 && (
                <button
                  type="button"
                  disabled={entering || !ownIds.has(characterId) || !!busyIn}
                  onClick={enter}
                  className="btn px-5 py-2 text-sm"
                >
                  {entering ? "..." : "Entra in giocata"}
                </button>
              )}
              {error && <p className="text-sm text-red-400">{error}</p>}
            </div>
          </div>
        )}
        {unseen > 0 && (
          <button
            type="button"
            onClick={() => scrollToEnd()}
            className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-red-900/70 bg-blood px-4 py-2 text-sm text-white shadow-lg shadow-black/60 hover:brightness-110"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              aria-hidden
            >
              <path d="M12 5v14M6 13l6 6 6-6" />
            </svg>
            {unseen} {unseen === 1 ? "nuovo messaggio" : "nuovi messaggi"}
          </button>
        )}
      </div>

      {joined && alert && (
        <button
          type="button"
          onClick={() => {
            setCharacterId(alert.id);
            setCmdTab("combattimento");
            setTool("comandi");
          }}
          className="flex w-full items-center justify-center gap-2 border border-red-800/70 bg-red-950/40 px-3 py-1.5 text-sm text-red-200 hover:bg-red-950/60"
        >
          ⚔ {alertWho}
          {alert.dying
            ? "morente: serve il tiro salvezza prima della sua azione"
            : `attaccato da ${alert.attackers.join(", ")}: scrivi l'azione e difenditi`}
        </button>
      )}

      {/* ---------------- Computer: barra dei comandi e riquadro di scrittura ---------------- */}
      {joined && (
        <>
          <form
            className="hidden space-y-2 border border-border bg-black/70 p-2 lg:block"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            {/* Riga in alto: destinatario, tipo, strumenti (solo simboli) e Invia */}
            <div className="flex items-center gap-2">
              {actors.length > 1 && (
                <select
                  value={actorId}
                  onChange={(e) => setCharacterId(e.target.value)}
                  aria-label="Personaggio"
                  title="Personaggio con cui scrivi"
                  className="input w-44! py-1 text-xs"
                >
                  {actors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.isNpc ? " (PNG)" : ""}
                    </option>
                  ))}
                </select>
              )}
              <input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                list={`dest-pc-${roomId}`}
                maxLength={60}
                placeholder="Tag libero / PG"
                aria-label="Destinatario"
                title="Destinatario"
                className="input w-48! py-1 text-xs"
              />
              <datalist id={`dest-pc-${roomId}`}>
                {others.map((o) => (
                  <option key={o.id} value={o.name} />
                ))}
              </datalist>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as MessageKind)}
                aria-label="Tipo"
                title="Tipo"
                className="input w-44! py-1 text-xs"
              >
                <option value="azione">{KIND_LABEL.azione}</option>
                <option value="fuori_gioco">{KIND_LABEL.fuori_gioco}</option>
                {canNarrate && (
                  <option value="master">{KIND_LABEL.master}</option>
                )}
              </select>
              <nav
                aria-label="Strumenti della chat"
                className="flex items-center gap-1"
              >
                {tools.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => openTool(t.id)}
                    aria-label={t.label}
                    title={t.label}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-blood/25 hover:text-[#c97a7a]"
                  >
                    <ToolIcon size={17}>{t.icon}</ToolIcon>
                  </button>
                ))}
              </nav>
              <span
                className={`ml-auto text-[0.7rem] ${left < 100 ? "text-red-400" : "text-muted"}`}
                title="Caratteri rimasti"
              >
                {left}
              </span>
              <button
                className="border border-border bg-gradient-to-b from-[#2a2626] to-[#141212] px-4 py-1 font-serif text-xs tracking-[0.18em] text-foreground uppercase transition hover:border-accent hover:text-accent disabled:opacity-50"
                disabled={sending || !text.trim()}
              >
                {sending ? "..." : "Invia"}
              </button>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
              onKeyDown={onKey}
              rows={4}
              maxLength={MAX_LEN}
              placeholder={`Scrivi qui la tua azione...\nInserire il parlato tra < >, il descritto fuori. Massimo ${MAX_LEN} caratteri. Invio per inviare, Maiusc+Invio per andare a capo.`}
              className="input block min-h-24 w-full resize-none text-sm"
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
          </form>

          {/* ---------------- Cellulare: barra di scrittura in basso ---------------- */}
          <form
            className="space-y-2 border-t border-border bg-black/85 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTool("tipo")}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-black/60 px-3 py-2 text-left text-xs text-foreground"
              >
                <span className="min-w-0 flex-1 truncate">
                  A: {recipient.trim() || "tutti"} · {KIND_LABEL[kind]}
                </span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  className="shrink-0 text-muted"
                  aria-hidden
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {tools.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => openTool(t.id)}
                  aria-label={t.label}
                  title={t.label}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[#d8b26a] transition hover:bg-blood/25 hover:text-accent"
                >
                  <ToolIcon size={18}>{t.icon}</ToolIcon>
                </button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <div className="relative min-w-0 flex-1">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
                  onKeyDown={onKey}
                  rows={2}
                  maxLength={MAX_LEN}
                  placeholder="Scrivi qui la tua azione..."
                  className="block max-h-40 w-full resize-none rounded-2xl border border-border bg-black/60 px-3 py-2.5 pr-16 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                />
                <span
                  className={`pointer-events-none absolute right-3 bottom-2 text-[0.625rem] ${left < 100 ? "text-red-400" : "text-muted"}`}
                >
                  {text.length}/{MAX_LEN}
                </span>
              </div>
              <button
                aria-label="Invia"
                disabled={sending || !text.trim()}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blood text-white shadow-lg shadow-black/60 transition hover:brightness-110 disabled:opacity-50"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  aria-hidden
                >
                  <path d="M12 19V5M6 11l6-6 6 6" />
                </svg>
              </button>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
          </form>
        </>
      )}

      <Modal
        open={tool !== null}
        onClose={() => setTool(null)}
        title={tool ? titles[tool] : ""}
        size={tool === "tipo" ? "md" : "lg"}
      >
        {tool === "tipo" && (
          <div className="space-y-3">
            {characterSelect}
            {recipientInput}
            {kindSelect}
            <p className="text-xs text-muted">
              Il parlato va tra &lt; &gt;, il descritto fuori. Massimo {MAX_LEN}{" "}
              caratteri.
            </p>
            <button
              type="button"
              onClick={() => setTool(null)}
              className="btn px-4 py-1.5 text-sm"
            >
              Fatto
            </button>
          </div>
        )}
        {tool === "comandi" &&
          (actorId ? (
            <ChatCommands
              key={actorId}
              roomId={roomId}
              characterId={actorId}
              canNarrate={canNarrate}
              others={others}
              initialTab={cmdTab}
              canNpc={canNpc}
              onDone={() => {
                setTool(null);
                combatAlerts(roomId, actorId).then((r) =>
                  setAlerts((list) => [
                    ...list.filter((a) => a.id !== actorId),
                    { id: actorId, ...r },
                  ]),
                );
              }}
            />
          ) : (
            <p className="text-muted">Serve un personaggio attivo.</p>
          ))}
        {tool === "notepad" && (
          <ChatNotepad
            characterId={actorId}
            maxLen={MAX_LEN}
            sendAs={`A: ${recipient.trim() || "tutti"} · ${KIND_LABEL[kind]}`}
            onSend={async (t) => {
              // copia l'azione nella barra di scrittura e la invia
              setText(t.slice(0, MAX_LEN));
              setTool(null);
              return send(t.slice(0, MAX_LEN));
            }}
          />
        )}
        {tool === "salva" && <ChatSave room={room} messages={messages} />}
      </Modal>
    </div>
  );
}

function ToolIcon({
  children,
  size = 15,
}: {
  children: ReactNode;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

type Who = {
  avatar: string | null;
  sigil: string | null;
  house: string | null;
};

function MessageRow({ message, who }: { message: Message; who?: Who }) {
  const time = new Date(message.created_at).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const to = message.recipient ? (
    <span className="text-muted normal-case"> → {message.recipient}</span>
  ) : null;
  const card = "max-lg:border-b max-lg:border-border/50 max-lg:py-3";

  if (message.kind === "dado") {
    const verb =
      (message.roll_data as { verb?: boolean } | null)?.verb ||
      /^(tira|effettua|attacca) /.test(message.content);
    return (
      <div className={card}>
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
            {verb ? "" : "tira "}
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  // Narrazione del master: scheda come le azioni, con scritto "Master"
  if (message.kind === "master") {
    return (
      <div className="border-l-2 border-accent bg-gradient-to-b from-[#45100b] to-[#2d0a07] px-3 py-2.5 shadow-lg shadow-black/70 sm:px-4 sm:py-3 max-lg:mt-2">
        <div className="mb-2 flex items-center gap-2.5">
          <span
            className="min-w-0 flex-1 truncate font-serif text-lg leading-tight font-semibold tracking-wide text-accent uppercase"
            title={`Narrazione di ${message.character_name}`}
          >
            Master
            {to && <span className="text-sm font-normal">{to}</span>}
          </span>
          <span className="shrink-0 text-xs text-muted">{time}</span>
        </div>
        <p className="chat-text whitespace-pre-line">
          <FormattedText text={message.content} />
        </p>
      </div>
    );
  }

  // Sussurro OFF: una riga, con una sfumatura sui toni del rosso
  if (message.kind === "fuori_gioco") {
    return (
      <p className="rounded-md bg-gradient-to-r from-black/80 via-[#5a1414]/55 to-black/80 px-3 py-1.5 text-sm text-[#d9b8b8] shadow shadow-black/60 max-lg:mt-2">
        <span className="mr-2 text-xs text-muted">{time}</span>
        <strong className="mr-2 text-xs font-bold tracking-wide text-foreground uppercase">
          {message.character_name} sussurra a {message.recipient || "tutti"}
        </strong>
        {message.content}
      </p>
    );
  }

  return (
    <div className="border-l-2 border-blood bg-black/80 px-3 py-2.5 shadow-lg shadow-black/70 sm:px-4 sm:py-3 max-lg:mt-2">
      <div className="mb-2 flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-accent/50 bg-black/60 font-serif text-accent">
          {who?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={who.avatar}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            message.character_name[0]
          )}
        </span>
        {/* della casata solo lo stemma, senza il cognome */}
        {who?.sigil && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={who.sigil}
            alt=""
            title={who.house ? `Casata ${who.house}` : undefined}
            className="h-7 w-7 shrink-0 object-contain"
          />
        )}
        <span className="min-w-0 flex-1 truncate font-serif text-lg leading-tight font-semibold tracking-wide text-accent uppercase">
          {message.character_name}
          {to && <span className="text-sm font-normal">{to}</span>}
        </span>
        <span className="shrink-0 text-xs text-muted">{time}</span>
      </div>
      <p className="chat-text whitespace-pre-line">
        {/* colore dell'azione scelto nelle Opzioni della scheda */}
        <span style={{ color: "var(--chat-action, inherit)" }}>
          <FormattedText text={message.content} />
        </span>
      </p>
    </div>
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
          // colore del parlato scelto nelle Opzioni della scheda; sul cellulare in corsivo
          <span
            key={i}
            className="font-semibold max-lg:font-normal max-lg:italic"
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

// Barra "Presenti in chat": chi e' in giocata, con il proprio nome evidenziato
function PresenceBar({
  present,
  mine,
  joined,
  busy,
  onExit,
  npcs,
  canNpc,
  onAddNpc,
  onRemoveNpc,
}: {
  present: Present[];
  mine: Set<string>;
  joined: boolean;
  busy: boolean;
  onExit: () => void;
  npcs: { id: string; name: string }[]; // PNG non ancora in questa chat
  canNpc: boolean; // l'utente muove i PNG
  onAddNpc: (id: string) => void;
  onRemoveNpc: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 border border-border bg-black/60 px-3 py-1.5 max-lg:border-x-0 max-lg:border-t-0">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="shrink-0 text-blood"
        aria-hidden
      >
        <path d="M4 6h3M4 12h3M4 18h3M10 6h10M10 12h10M10 18h10" />
      </svg>
      <span className="shrink-0 font-serif text-xs font-semibold tracking-[0.16em] text-accent uppercase max-sm:hidden">
        Presenti in chat
      </span>
      <ol className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-sm whitespace-nowrap [scrollbar-width:none]">
        {present.length === 0 && (
          <li className="text-muted">Nessuno sta giocando</li>
        )}
        {present.map((p, i) => (
          <li key={p.id} className="flex items-center gap-1">
            {i > 0 && (
              <span aria-hidden className="text-muted">
                ›
              </span>
            )}
            <span
              className={
                mine.has(p.id)
                  ? "rounded-sm border border-blood bg-blood/40 px-1.5 text-white"
                  : "px-1 text-foreground"
              }
            >
              {p.name}
              {p.isNpc && (
                <span className="ml-1 text-[0.6rem] tracking-wider text-accent uppercase">
                  png
                </span>
              )}
            </span>
            {canNpc && p.isNpc && (
              <button
                type="button"
                onClick={() => onRemoveNpc(p.id)}
                aria-label={`Togli ${p.name} dalla chat`}
                title="Togli dalla chat"
                className="text-xs text-muted hover:text-red-400"
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ol>
      {/* nessun PNG da portare: si creano in Gestione -> PNG */}
      {canNpc && npcs.length === 0 && !present.some((p) => p.isNpc) && (
        <Link
          href="/gestione/png"
          className="shrink-0 border border-dashed border-border px-2 py-0.5 text-xs text-muted transition hover:border-accent hover:text-accent"
          title="Non ci sono PNG in anagrafe: creane uno in Gestione → PNG"
        >
          + Crea un PNG
        </Link>
      )}
      {canNpc && npcs.length > 0 && (
        <select
          value=""
          onChange={(e) => e.target.value && onAddNpc(e.target.value)}
          aria-label="Porta un PNG in giocata"
          className="input w-36! shrink-0 py-0.5 text-xs"
        >
          <option value="">+ PNG...</option>
          {npcs.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      )}
      {joined && (
        <button
          type="button"
          disabled={busy}
          onClick={onExit}
          className="shrink-0 border border-border px-2 py-0.5 text-xs text-muted transition hover:border-accent hover:text-accent"
        >
          Esci dalla chat
        </button>
      )}
    </div>
  );
}

// Azioni di chi sta giocando, sfocate: righe finte, il testo vero non arriva al browser
function BlurredRows({ count }: { count: number }) {
  const rows = Math.min(Math.max(count, 0), 12);
  if (rows === 0) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none space-y-4 py-2 blur-[5px] select-none"
    >
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="space-y-1.5">
          <div className="h-3 w-24 rounded bg-accent/50" />
          <div
            className="h-3 rounded bg-foreground/30"
            style={{ width: `${70 + ((i * 37) % 30)}%` }}
          />
          <div
            className="h-3 rounded bg-foreground/30"
            style={{ width: `${40 + ((i * 53) % 45)}%` }}
          />
        </div>
      ))}
    </div>
  );
}
