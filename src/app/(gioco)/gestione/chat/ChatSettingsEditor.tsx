"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CHAT_LENGTH } from "@/lib/chat-ttl";

// Limite di caratteri di azioni, OFF e narrazioni
export default function ChatSettingsEditor({
  maxLength,
}: {
  maxLength: number | null; // null = migrazione 0109 non ancora eseguita
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [value, setValue] = useState(String(maxLength ?? CHAT_LENGTH.default));
  const [saved, setSaved] = useState(maxLength);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const n = Math.trunc(Number(value));
  const valid = n >= CHAT_LENGTH.min && n <= CHAT_LENGTH.max;

  async function save() {
    setMsg(null);
    const { error } = await supabase
      .from("chat_settings")
      .update({ max_length: n })
      .eq("id", true);
    if (error) return setMsg({ ok: false, text: "Non salvato." });
    setSaved(n);
    setMsg({ ok: true, text: "Salvato: vale da subito per tutte le chat." });
    router.refresh();
  }

  if (maxLength === null)
    return (
      <p className="text-sm text-red-400">
        Prima va eseguita la migrazione 0109 in Supabase.
      </p>
    );

  return (
    <div className="space-y-3 border border-border/60 bg-black/30 p-4">
      <label className="block">
        <span className="mb-1 block text-xs tracking-wider text-muted uppercase">
          Limite di caratteri di un&apos;azione
        </span>
        <input
          type="number"
          min={CHAT_LENGTH.min}
          max={CHAT_LENGTH.max}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="input w-32! py-1.5"
        />
      </label>
      <p className="text-xs text-muted">
        Vale per le azioni, i messaggi OFF e le narrazioni del master (non per i
        tiri di dado). Da {CHAT_LENGTH.min} a {CHAT_LENGTH.max} caratteri; il
        contatore e il Notepad della chat si adeguano da soli.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!valid || n === saved}
          onClick={save}
          className="btn px-4 py-1.5 text-sm"
        >
          Salva
        </button>
        {!valid && (
          <span className="text-sm text-red-400">
            Scrivi un numero tra {CHAT_LENGTH.min} e {CHAT_LENGTH.max}.
          </span>
        )}
        {msg && (
          <span
            className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}
          >
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
