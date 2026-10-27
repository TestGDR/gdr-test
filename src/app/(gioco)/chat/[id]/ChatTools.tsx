"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/lib/types";

export type RoomInfo = {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
  access: string;
  location_id: string;
  location_name: string;
};

// Notepad: appunti personali (restano su questo dispositivo); "Invia in chat"
// manda il testo in chat e svuota il notepad
export function ChatNotepad({
  characterId,
  sendAs,
  maxLen,
  onSend,
}: {
  characterId: string;
  sendAs: string; // es. "A: tutti · Parlato / Azione"
  maxLen: number;
  onSend: (text: string) => Promise<boolean>;
}) {
  const key = `notepad:${characterId}`;
  const [text, setText] = useState(() => {
    try {
      return typeof window === "undefined"
        ? ""
        : (localStorage.getItem(key) ?? "");
    } catch {
      return "";
    }
  });
  const [saved, setSaved] = useState(false);
  const [sending, setSending] = useState(false);
  const length = text.trim().length;
  async function send() {
    setSending(true);
    const sent = await onSend(text.trim());
    setSending(false);
    // inviato: il notepad si svuota (se l'invio non riesce il testo resta)
    if (sent) save("");
  }
  function save(v: string) {
    setText(v);
    setSaved(false);
    try {
      localStorage.setItem(key, v);
      setSaved(true);
    } catch {
      /* archivio del browser non disponibile */
    }
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">
        Appunti del personaggio: li vedi solo tu e restano su questo
        dispositivo.
      </p>
      <textarea
        value={text}
        onChange={(e) => save(e.target.value)}
        rows={14}
        maxLength={10000}
        className="input resize-y text-sm"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={sending || length === 0 || length > maxLen}
          onClick={send}
          className="btn px-4 py-1.5 text-sm"
        >
          {sending ? "..." : "Invia in chat"}
        </button>
        <span className="text-xs text-muted">
          {sendAs} ·{" "}
          <span className={length > maxLen ? "text-red-400" : ""}>
            {length}/{maxLen}
          </span>
          {saved && " · Salvato."}
        </span>
      </div>
      {length > maxLen && (
        <p className="text-xs text-red-400">
          Per inviarlo in chat il testo deve stare in {maxLen} caratteri.
        </p>
      )}
    </div>
  );
}

// Salva: scarica in un file di testo tutta la giocata, dal momento in cui il
// personaggio e' entrato in giocata fino ad adesso (dal database, non solo
// l'ultima ora visibile in chat)
export function ChatSave({
  room,
  messages,
  characterId,
}: {
  room: RoomInfo;
  messages: Message[]; // quelle visibili: si usano se il PG non e' in giocata
  characterId: string | null; // il mio PG in giocata in questa chat
}) {
  const supabase = useMemo(() => createClient(), []);
  const [game, setGame] = useState<{ since: string | null; list: Message[] } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: me } = characterId
        ? await supabase
            .from("chat_presence")
            .select("joined_at")
            .eq("room_id", room.id)
            .eq("character_id", characterId)
            .maybeSingle()
        : { data: null };
      const since = (me?.joined_at as string | undefined) ?? null;
      if (!since) return setGame({ since: null, list: messages });
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("room_id", room.id)
        .gte("created_at", new Date(Date.parse(since) - 1000).toISOString())
        .order("created_at")
        .order("id")
        .limit(5000);
      setGame({ since, list: (data ?? []) as Message[] });
    })();
  }, [supabase, room.id, characterId, messages]);

  const list = game?.list ?? [];
  const when = (iso: string) => new Date(iso).toLocaleString("it-IT", { timeZone: "Europe/Rome" });

  function download() {
    const lines = list.map((m) => {
      const to = m.recipient ? ` → ${m.recipient}` : "";
      const tag =
        m.kind === "fuori_gioco"
          ? "[OFF] "
          : m.kind === "master"
            ? "[MASTER] "
            : m.kind === "dado"
              ? "[DADO] "
              : m.kind === "sistema"
                ? "[SISTEMA] "
                : "";
      return `[${when(m.created_at)}] ${tag}${m.character_name}${to}: ${m.content}`;
    });
    const head = game?.since
      ? `Giocata dal ${when(game.since)} al ${when(new Date().toISOString())}`
      : "Azioni visibili in chat";
    const blob = new Blob(
      [`${room.name} — ${room.location_name}\n${head}\n\n${lines.join("\n")}\n`],
      { type: "text/plain;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${room.name.replace(/[^\w\s-]/g, "").trim() || "chat"} ${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const actions = list.filter((m) => m.kind === "azione" || m.kind === "master").length;
  return (
    <div className="space-y-3">
      {!game ? (
        <p className="text-sm text-muted">Caricamento della giocata...</p>
      ) : game.since ? (
        <p className="text-sm text-muted">
          Scarica tutta la giocata, da quando il tuo personaggio è entrato ({when(game.since)}) a
          adesso: {actions} {actions === 1 ? "azione" : "azioni"} ({list.length} messaggi in tutto, con dadi e avvisi),
          in un file di testo con data, ora, personaggio e tipo di messaggio. Salvala prima di uscire dalla giocata.
        </p>
      ) : (
        <p className="text-sm text-muted">
          Non sei in giocata in questa chat: puoi scaricare solo le azioni visibili adesso ({list.length} messaggi).
        </p>
      )}
      <button
        type="button"
        onClick={download}
        disabled={!list.length}
        className="btn px-4 py-1.5 text-sm"
      >
        Scarica la giocata
      </button>
    </div>
  );
}
