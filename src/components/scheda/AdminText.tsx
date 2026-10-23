"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// L'utente e' admin? (solo gli admin correggono i testi scritti dei tratti)
export function useIsAdmin() {
  const supabase = useMemo(() => createClient(), []);
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    supabase.rpc("is_admin").then(({ data }) => setAdmin(data === true));
  }, [supabase]);
  return admin;
}

// Testo scritto dal giocatore (riga di un tratto narrativo, spiegazione dei
// tratti): tutti lo leggono, solo gli admin vedono la pennina per correggerlo
export default function AdminText({
  value,
  canEdit,
  onSave,
  multiline = false,
  maxLength = 300,
  className = "",
  emptyLabel = "",
}: {
  value: string;
  canEdit: boolean;
  onSave: (text: string) => Promise<string | null>; // errore, oppure null
  multiline?: boolean;
  maxLength?: number;
  className?: string;
  emptyLabel?: string; // testo mostrato all'admin quando e' vuoto
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (editing)
    return (
      <div className="mt-1 space-y-1.5">
        {multiline ? (
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={maxLength} rows={5} className="input resize-y text-sm" />
        ) : (
          <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={maxLength} className="input py-1 text-sm" />
        )}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const err = await onSave(draft.trim());
              setBusy(false);
              setError(err);
              if (!err) setEditing(false);
            }}
            className="btn px-3 py-1 text-xs"
          >
            Salva
          </button>
          <button type="button" onClick={() => (setEditing(false), setDraft(value), setError(null))} className="btn-ghost px-3 py-1 text-xs">
            Annulla
          </button>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );

  if (!value && !canEdit) return null;
  return (
    <p className={`flex items-start gap-2 ${className}`}>
      <span className={`min-w-0 flex-1 whitespace-pre-line ${value ? "" : "text-muted not-italic"}`}>{value || emptyLabel}</span>
      {canEdit && (
        <button
          type="button"
          onClick={() => (setDraft(value), setEditing(true))}
          title="Correggi (solo admin)"
          aria-label="Correggi (solo admin)"
          className="shrink-0 text-muted not-italic hover:text-accent"
        >
          ✎
        </button>
      )}
    </p>
  );
}
