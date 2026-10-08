"use client";

import { useState } from "react";
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

// Notepad: appunti personali (restano su questo dispositivo)
export function ChatNotepad({ characterId }: { characterId: string }) {
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
      <p className="text-xs text-muted">{saved ? "Salvato." : " "}</p>
    </div>
  );
}

// Salva: scarica la giocata in un file di testo
export function ChatSave({
  room,
  messages,
}: {
  room: RoomInfo;
  messages: Message[];
}) {
  function download() {
    const lines = messages.map((m) => {
      const t = new Date(m.created_at).toLocaleString("it-IT", {
        timeZone: "Europe/Rome",
      });
      const to = m.recipient ? ` → ${m.recipient}` : "";
      const tag =
        m.kind === "fuori_gioco"
          ? "[OFF] "
          : m.kind === "master"
            ? "[MASTER] "
            : m.kind === "dado"
              ? "[DADO] "
              : "";
      return `[${t}] ${tag}${m.character_name}${to}: ${m.content}`;
    });
    const blob = new Blob(
      [`${room.name} — ${room.location_name}\n\n${lines.join("\n")}\n`],
      { type: "text/plain;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${room.name.replace(/[^\w\s-]/g, "").trim() || "chat"} ${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Scarica la giocata che vedi in chat ({messages.length} messaggi) in un
        file di testo, con data, ora, personaggio e tipo di messaggio.
      </p>
      <button
        type="button"
        onClick={download}
        disabled={!messages.length}
        className="btn px-4 py-1.5 text-sm"
      >
        Scarica la chat
      </button>
    </div>
  );
}
