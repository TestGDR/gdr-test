"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const SUGGESTIONS = ["Lavori in corso", "Iscrizioni chiuse"];

// Interruttore delle iscrizioni, con il messaggio mostrato in home quando sono chiuse
export default function SignupSwitch({ open, message }: { open: boolean; message: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(open);
  const [text, setText] = useState(message);
  const [savedText, setSavedText] = useState(message);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(next: { open?: boolean; message?: string }) {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase
      .from("signup_settings")
      .update({ ...next, updated_at: new Date().toISOString() })
      .eq("id", true);
    setBusy(false);
    if (error) return setMsg({ ok: false, text: "Non salvato." });
    if (next.open !== undefined) setIsOpen(next.open);
    if (next.message !== undefined) setSavedText(next.message);
    setMsg({
      ok: true,
      text:
        next.open === undefined
          ? "Messaggio salvato."
          : next.open
            ? "Iscrizioni aperte: il pulsante Registrati è di nuovo attivo."
            : "Iscrizioni chiuse: il pulsante Registrati è disattivato.",
    });
    router.refresh();
  }

  return (
    <div className="space-y-5 border border-border/60 bg-black/30 p-4">
      <div className="flex flex-wrap items-center gap-4">
        <span
          className={`inline-flex items-center gap-2 font-serif text-xl ${isOpen ? "text-green-400" : "text-red-400"}`}
        >
          <span className={`h-3 w-3 rounded-full ${isOpen ? "bg-green-500" : "bg-red-500"}`} aria-hidden />
          {isOpen ? "Iscrizioni aperte" : "Iscrizioni chiuse"}
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => save({ open: !isOpen })}
          className={isOpen ? "btn-ghost px-4 py-1.5 text-sm" : "btn px-4 py-1.5 text-sm"}
        >
          {isOpen ? "Chiudi le iscrizioni" : "Riapri le iscrizioni"}
        </button>
      </div>

      <div>
        <label className="block">
          <span className="mb-1 block text-xs tracking-wider text-muted uppercase">
            Messaggio in home quando sono chiuse (facoltativo)
          </span>
          <input
            value={text}
            maxLength={200}
            onChange={(e) => setText(e.target.value)}
            placeholder="Iscrizioni chiuse"
            className="input py-1.5"
          />
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted">Veloci:</span>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setText(s)}
              className="rounded border border-border px-2 py-0.5 hover:border-accent hover:text-accent"
            >
              {s}
            </button>
          ))}
          <button
            type="button"
            disabled={busy || text.trim() === savedText}
            onClick={() => save({ message: text.trim() })}
            className="btn ml-auto px-3 py-1 text-xs"
          >
            Salva messaggio
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">
          Compare sotto il pulsante Registrati, che resta visibile ma non si può premere. Senza messaggio compare
          &quot;Iscrizioni chiuse&quot;.
        </p>
      </div>

      {msg && <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>}
    </div>
  );
}
